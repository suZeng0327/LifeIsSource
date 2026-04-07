// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, where, deleteDoc, getDoc, setDoc, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBv05NaIqSaenLVsnGihFee8eRNHJ1ldYs",
  authDomain: "lifeissource.firebaseapp.com",
  projectId: "lifeissource",
  storageBucket: "lifeissource.firebasestorage.app",
  messagingSenderId: "153999974394",
  appId: "1:153999974394:web:0a39d28d4ad4280e69ce43"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const provider = new GoogleAuthProvider();

let currentView = 'all'; 
let currentSort = 'latest'; 
let targetUserUid = null;
let editingPostId = null;
let openCommentsStore = new Set();
let myFollowingList = []; 
let showAllPopular = false;

// [복구] 유저 데이터 및 인기 유저 목록 렌더링
async function syncUserData(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, { name: user.displayName, following: [], followers: [], photoURL: user.photoURL });
    }
    onSnapshot(userRef, (doc) => {
        myFollowingList = doc.data()?.following || [];
        renderFollowSidebar();
    });
    renderPopularUsers(); // 인기 유저 목록 호출
}

// [신규] 인기 많은 사람 목록 출력
async function renderPopularUsers() {
    const userListEl = document.getElementById('popular-users-list');
    const moreBtn = document.getElementById('more-users-btn');
    
    const usersRef = collection(db, "users");
    const q = query(usersRef); 
    const querySnapshot = await getDocs(q);
    
    let users = [];
    querySnapshot.forEach(doc => {
        users.push({ uid: doc.id, ...doc.data() });
    });

    // 팔로워 수 기준 내림차순 정렬
    users.sort((a, b) => (b.followers?.length || 0) - (a.followers?.length || 0));

    const displayUsers = showAllPopular ? users : users.slice(0, 10);
    
    userListEl.innerHTML = displayUsers.map(u => `
        <div class="follow-item" onclick="showUserPosts('${u.uid}')">🔥 ${u.name} (${u.followers?.length || 0})</div>
    `).join('');

    if (users.length > 10 && !showAllPopular) {
        moreBtn.style.display = 'block';
        moreBtn.onclick = () => { showAllPopular = true; renderPopularUsers(); };
    } else {
        moreBtn.style.display = 'none';
    }
}

function renderFollowSidebar() {
    const listEl = document.getElementById('follow-list');
    if (!auth.currentUser) { listEl.innerHTML = "로그인이 필요합니다."; return; }
    if (myFollowingList.length === 0) { listEl.innerHTML = "<p>팔로우한 유저가 없습니다.</p>"; return; }
    listEl.innerHTML = myFollowingList.map(u => `
        <div class="follow-item" onclick="showUserPosts('${u.uid}')">👤 ${u.name}</div>
    `).join('');
}

// [수정] 버튼 중복 클릭 방지 (상태값 명확히 분리)
function updateSortButtons() {
    const btnLatest = document.getElementById('sort-latest');
    const btnPopular = document.getElementById('sort-popular');
    const btnFollow = document.getElementById('sort-follow');

    btnLatest.classList.remove('active');
    btnPopular.classList.remove('active');
    btnFollow.classList.remove('active');

    if (currentView === 'follow') {
        btnFollow.classList.add('active');
    } else if (currentSort === 'popular') {
        btnPopular.classList.add('active');
    } else {
        btnLatest.classList.add('active');
    }
}

function renderAuthUI(user, viewMode = 'all') {
    const authSection = document.getElementById('auth-section');
    if (user) {
        let actionBtn = `<button id="my-posts-btn" class="my-posts-btn">내가 쓴 글</button>`;
        if (viewMode === 'my' || viewMode === 'user') {
            actionBtn = `<button id="home-btn-nav" class="home-btn">홈으로</button>`;
        }

        authSection.innerHTML = `
            <div class="user-info">
                ${actionBtn}
                <span class="user-name">👤 ${user.displayName}님</span> 
                <button id="logout-btn" class="logout-style">로그아웃</button>
            </div>
        `;
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        if (document.getElementById('my-posts-btn')) document.getElementById('my-posts-btn').onclick = showMyPosts;
        if (document.getElementById('home-btn-nav')) document.getElementById('home-btn-nav').onclick = goHome;
    } else {
        authSection.innerHTML = `<button id="login-btn">구글 로그인</button>`;
        document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
    }
}

// [수정] 홈으로 가기 (모든 상태 초기화 및 UI 복구)
function goHome() {
    currentView = 'all';
    currentSort = 'latest'; // 홈으로 올 때 정렬도 초기화
    targetUserUid = null;
    editingPostId = null;
    resetWriteArea();
    document.getElementById('user-profile-header').style.display = 'none';
    document.getElementById('write-area').style.display = 'block';
    document.getElementById('sort-area').style.display = 'flex';
    renderAuthUI(auth.currentUser, 'all');
    updateFeed();
}
window.goHome = goHome;

function showMyPosts() {
    if (!auth.currentUser) return;
    currentView = 'my';
    document.getElementById('user-profile-header').style.display = 'none';
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    renderAuthUI(auth.currentUser, 'my');
    updateFeed();
}

window.showUserPosts = async (uid) => {
    currentView = 'user';
    targetUserUid = uid;
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();
    const isFollowing = myFollowingList.some(u => u.uid === uid);

    const header = document.getElementById('user-profile-header');
    header.style.display = 'block';
    header.innerHTML = `
        <div class="profile-header-card">
            <h2>${userData.name} 님의 페이지</h2>
            <div class="profile-info">팔로워: <b>${userData.followers?.length || 0}</b>명</div>
            <div style="display:flex; justify-content:center; gap:10px;">
                ${auth.currentUser?.uid !== uid ? `
                    <button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="toggleFollow('${uid}', '${userData.name}', ${isFollowing})">
                        ${isFollowing ? '팔로잉' : '팔로우'}
                    </button>
                ` : ''}
                <button class="home-btn" onclick="goHome()">홈으로</button>
            </div>
        </div>
    `;
    
    renderAuthUI(auth.currentUser, 'user');
    updateFeed();
};

window.toggleFollow = async (uid, name, isFollowing) => {
    if (!auth.currentUser) return;
    const myRef = doc(db, "users", auth.currentUser.uid);
    const targetRef = doc(db, "users", uid);

    if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove({ uid, name }) });
        await updateDoc(targetRef, { followers: arrayRemove(auth.currentUser.uid) });
    } else {
        await updateDoc(myRef, { following: arrayUnion({ uid, name }) });
        await updateDoc(targetRef, { followers: arrayUnion(auth.currentUser.uid) });
    }
    showUserPosts(uid);
};

document.getElementById('home-logo').onclick = goHome;

onAuthStateChanged(auth, (user) => {
    syncUserData(user);
    renderAuthUI(user, currentView);
    updateFeed();
});

document.getElementById('post-btn').onclick = async () => {
    const code = document.getElementById('code-input').value;
    const desc = document.getElementById('desc-input').value;
    const lang = document.getElementById('language-select').value;
    if (!auth.currentUser || !code.trim()) return;

    try {
        if (editingPostId) {
            await updateDoc(doc(db, "posts", editingPostId), {
                content: code, description: desc, language: lang, updatedAt: serverTimestamp()
            });
            editingPostId = null;
        } else {
            await addDoc(collection(db, "posts"), {
                author: auth.currentUser.displayName,
                uid: auth.currentUser.uid,
                content: code, description: desc, language: lang,
                createdAt: serverTimestamp(), likes: [], comments: []
            });
        }
        resetWriteArea();
    } catch (e) { console.error(e); }
};

function resetWriteArea() {
    document.getElementById('code-input').value = "";
    document.getElementById('desc-input').value = "";
    document.getElementById('language-select').value = "plaintext";
    document.getElementById('post-btn').innerText = "공유하기";
    document.querySelector('.write-card h3').innerText = "새 코드 공유하기";
    editingPostId = null;
}

function updateFeed() {
    if (window.unsubscribeFeed) window.unsubscribeFeed();
    const feed = document.getElementById('feed');
    updateSortButtons();

    let q;
    if (currentView === 'my') {
        q = query(collection(db, "posts"), where("uid", "==", auth.currentUser?.uid), orderBy("createdAt", "desc"));
    } else if (currentView === 'user') {
        q = query(collection(db, "posts"), where("uid", "==", targetUserUid), orderBy("createdAt", "desc"));
    } else if (currentView === 'follow') {
        const followUids = myFollowingList.map(u => u.uid);
        if (followUids.length === 0) {
            feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#888;">팔로우한 사람이 없습니다.</p>`;
            return;
        }
        q = query(collection(db, "posts"), where("uid", "in", followUids), orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    window.unsubscribeFeed = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        if (currentSort === 'popular') posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        feed.innerHTML = "";
        posts.forEach((post) => feed.appendChild(createPostElement(post)));
        document.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
    });
}

// [복구] 댓글 수정/삭제/좋아요 로직 포함
function createPostElement(post) {
    const isOwner = auth.currentUser?.uid === post.uid;
    const isLiked = post.likes?.includes(auth.currentUser?.uid);
    const date = post.createdAt?.toDate().toLocaleString() || "방금 전";
    const div = document.createElement('div');
    div.className = 'post';
    const isCommentOpen = openCommentsStore.has(post.id) ? 'display: block;' : 'display: none;';

    div.innerHTML = `
        <div class="post-header">
            <div>
                <span class="post-author" onclick="showUserPosts('${post.uid}')" style="cursor:pointer">👤 ${post.author}</span>
                <span class="lang-badge">${post.language}</span>
            </div>
            <div class="header-right">
                <span class="post-date">${date}</span>
                ${isOwner ? `
                    <button class="edit-btn" onclick="startEdit('${post.id}')">수정</button>
                    <button class="delete-btn" onclick="deletePost('${post.id}')">삭제</button>
                ` : ''}
            </div>
        </div>
        ${post.description ? `<div class="post-desc">${post.description}</div>` : ''}
        <pre><button class="copy-btn">복사</button><code class="language-${post.language}">${escapeHtml(post.content)}</code></pre>
        <div class="post-footer">
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', ${isLiked})">❤️ 좋아요 ${post.likes?.length || 0}</button>
            <button class="comment-toggle" onclick="toggleComments('${post.id}')">💬 댓글 ${post.comments?.length || 0}</button>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="${isCommentOpen}">
            <div class="comment-list">
                ${post.comments?.map((c, index) => `
                    <div class="comment-item">
                        <div class="comment-main">
                            <div>
                                <span class="comment-user" onclick="showUserPosts('${c.uid}')" style="cursor:pointer">${c.user}:</span>
                                <span class="comment-text">${escapeHtml(c.text)}</span>
                            </div>
                            <div class="comment-actions">
                                <button onclick="toggleCommentLike('${post.id}', ${index})" style="background:none; color:${c.likes?.includes(auth.currentUser?.uid) ? '#ff5252' : '#888'}">♥ ${c.likes?.length || 0}</button>
                                ${auth.currentUser?.uid === c.uid ? `
                                    <button onclick="editComment('${post.id}', ${index}, '${c.text}')">수정</button>
                                    <button onclick="deleteComment('${post.id}', ${index})">삭제</button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="comment-input-area">
                <input type="text" id="input-${post.id}" placeholder="댓글을 입력하세요...">
                <button onclick="addComment('${post.id}')">등록</button>
            </div>
        </div>
    `;
    div.querySelector('.copy-btn').onclick = () => navigator.clipboard.writeText(post.content);
    return div;
}

// [복구] 댓글 관련 상세 기능
window.addComment = async (postId) => {
    const input = document.getElementById(`input-${postId}`);
    if (!auth.currentUser || !input.value.trim()) return;
    await updateDoc(doc(db, "posts", postId), {
        comments: arrayUnion({ user: auth.currentUser.displayName, text: input.value, uid: auth.currentUser.uid, likes: [], createdAt: Date.now() })
    });
    input.value = "";
};

window.deleteComment = async (postId, index) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = postSnap.data().comments;
    comments.splice(index, 1);
    await updateDoc(postRef, { comments });
};

window.editComment = async (postId, index, oldText) => {
    const newText = prompt("댓글 수정:", oldText);
    if (!newText || newText === oldText) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = postSnap.data().comments;
    comments[index].text = newText;
    await updateDoc(postRef, { comments });
};

window.toggleCommentLike = async (postId, index) => {
    if (!auth.currentUser) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = postSnap.data().comments;
    const likes = comments[index].likes || [];
    const uid = auth.currentUser.uid;
    comments[index].likes = likes.includes(uid) ? likes.filter(id => id !== uid) : [...likes, uid];
    await updateDoc(postRef, { comments });
};

window.toggleLike = async (postId, isLiked) => {
    if (!auth.currentUser) return;
    await updateDoc(doc(db, "posts", postId), {
        likes: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
    });
};

window.toggleComments = (postId) => {
    const el = document.getElementById(`comments-${postId}`);
    if (el.style.display === 'block') {
        el.style.display = 'none'; openCommentsStore.delete(postId);
    } else {
        el.style.display = 'block'; openCommentsStore.add(postId);
    }
};

window.deletePost = async (postId) => {
    if (confirm("정말 삭제하시겠습니까?")) await deleteDoc(doc(db, "posts", postId));
};

window.startEdit = async (postId) => {
    const postSnap = await getDoc(doc(db, "posts", postId));
    const data = postSnap.data();
    document.getElementById('code-input').value = data.content;
    document.getElementById('desc-input').value = data.description;
    document.getElementById('language-select').value = data.language;
    editingPostId = postId;
    document.getElementById('post-btn').innerText = "수정 완료";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// [수정] 정렬 버튼 클릭 시 다른 뷰 해제
document.getElementById('sort-latest').onclick = () => { currentSort = 'latest'; currentView = 'all'; updateFeed(); };
document.getElementById('sort-popular').onclick = () => { currentSort = 'popular'; currentView = 'all'; updateFeed(); };
document.getElementById('sort-follow').onclick = () => { currentView = 'follow'; currentSort = 'latest'; updateFeed(); };
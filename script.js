import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, where, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let currentView = 'all'; // all, my, user, follow
let currentSort = 'latest'; 
let targetUserUid = null; // 특정 유저 페이지 방문 시 저장
let editingPostId = null;
let openCommentsStore = new Set();
let myFollowingList = []; 

// 유저 데이터 생성 및 팔로우 목록 실시간 동기화
async function syncUserData(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, { name: user.displayName, following: [], followers: [] });
    }
    // 팔로우 목록 실시간 업데이트
    onSnapshot(userRef, (doc) => {
        myFollowingList = doc.data()?.following || [];
        renderFollowSidebar();
    });
}

// 사이드바 팔로우 목록 렌더링
function renderFollowSidebar() {
    const listEl = document.getElementById('follow-list');
    if (!auth.currentUser) { listEl.innerHTML = "로그인이 필요합니다."; return; }
    if (myFollowingList.length === 0) { listEl.innerHTML = "<p>팔로우한 유저가 없습니다.</p>"; return; }
    
    listEl.innerHTML = myFollowingList.map(u => `
        <div class="follow-item" onclick="showUserPosts('${u.uid}')">👤 ${u.name}</div>
    `).join('');
}

function getLangName(lang) {
    if (lang === 'csharp') return 'C#';
    return lang;
}

function updateSortButtons() {
    document.getElementById('sort-latest').classList.toggle('active', currentSort === 'latest' && currentView === 'all');
    document.getElementById('sort-popular').classList.toggle('active', currentSort === 'popular');
    document.getElementById('sort-follow').classList.toggle('active', currentView === 'follow');
}

function renderAuthUI(user, viewMode = 'all') {
    const authSection = document.getElementById('auth-section');
    if (user) {
        let actionBtn = `<button id="my-posts-btn" class="my-posts-btn">내가 쓴 글</button>`;
        if (viewMode === 'my' || viewMode === 'user') actionBtn = `<button id="home-btn" class="home-btn">홈으로 돌아가기</button>`;

        authSection.innerHTML = `
            <div class="user-info">
                ${actionBtn}
                <span class="user-name">👤 ${user.displayName}님</span> 
                <button id="logout-btn" class="logout-style">로그아웃</button>
            </div>
        `;
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        if (document.getElementById('my-posts-btn')) document.getElementById('my-posts-btn').onclick = showMyPosts;
        if (document.getElementById('home-btn')) document.getElementById('home-btn').onclick = goHome;
    } else {
        authSection.innerHTML = `<button id="login-btn">구글 로그인</button>`;
        document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
    }
}

function goHome() {
    currentView = 'all';
    targetUserUid = null;
    editingPostId = null;
    resetWriteArea();
    document.getElementById('user-profile-header').style.display = 'none';
    document.getElementById('write-area').style.display = 'block';
    document.getElementById('sort-area').style.display = 'flex';
    renderAuthUI(auth.currentUser, 'all');
    updateFeed();
}

function showMyPosts() {
    if (!auth.currentUser) return;
    currentView = 'my';
    document.getElementById('user-profile-header').style.display = 'none';
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    renderAuthUI(auth.currentUser, 'my');
    updateFeed();
}

// [핵심] 특정 유저 페이지 보기
window.showUserPosts = async (uid) => {
    currentView = 'user';
    targetUserUid = uid;
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    
    // 유저 정보 가져오기
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();
    const isFollowing = myFollowingList.some(u => u.uid === uid);

    const header = document.getElementById('user-profile-header');
    header.style.display = 'block';
    header.innerHTML = `
        <div class="profile-header-card">
            <h2>${userData.name} 님의 페이지</h2>
            <div class="profile-info">팔로워: <b>${userData.followers?.length || 0}</b>명</div>
            ${auth.currentUser?.uid !== uid ? `
                <button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="toggleFollow('${uid}', '${userData.name}', ${isFollowing})">
                    ${isFollowing ? '팔로잉' : '팔로우'}
                </button>
            ` : ''}
            <button class="home-btn" onclick="goHome()">홈으로</button>
        </div>
    `;
    
    renderAuthUI(auth.currentUser, 'user');
    updateFeed();
};

// [핵심] 팔로우 토글 로직
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
    showUserPosts(uid); // 헤더 갱신
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
                content: code,
                description: desc,
                language: lang,
                updatedAt: serverTimestamp()
            });
            editingPostId = null;
        } else {
            await addDoc(collection(db, "posts"), {
                author: auth.currentUser.displayName,
                uid: auth.currentUser.uid,
                content: code,
                description: desc,
                language: lang,
                createdAt: serverTimestamp(),
                likes: [],
                comments: []
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
        // 팔로우한 사람들의 UID만 추출
        const followUids = myFollowingList.map(u => u.uid);
        if (followUids.length === 0) {
            feed.innerHTML = `<p style="color:#888; text-align:center; margin-top:50px;">팔로우한 사람이 없습니다.</p>`;
            return;
        }
        // Firestore 'in' 쿼리는 최대 10명/30명 제한이 있을 수 있으나 기본 구현
        q = query(collection(db, "posts"), where("uid", "in", followUids), orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    window.unsubscribeFeed = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        if (currentSort === 'popular') posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        feed.innerHTML = currentView === 'my' ? `<h2 style="margin-bottom:20px;">내 게시물 목록</h2>` : "";
        if (posts.length === 0 && currentView !== 'follow') feed.innerHTML += `<p style="color:#888;">게시물이 없습니다.</p>`;

        posts.forEach((post) => feed.appendChild(createPostElement(post)));
        document.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
    });
}

function createPostElement(post) {
    const isOwner = auth.currentUser?.uid === post.uid;
    const isLiked = post.likes?.includes(auth.currentUser?.uid);
    const date = post.createdAt?.toDate().toLocaleString() || "방금 전";
    
    const div = document.createElement('div');
    div.className = 'post';
    div.id = `post-${post.id}`;
    
    const isCommentOpen = openCommentsStore.has(post.id) ? 'display: block;' : 'display: none;';

    div.innerHTML = `
        <div class="post-header">
            <div>
                <span class="post-author" onclick="showUserPosts('${post.uid}')" style="cursor:pointer">👤 ${post.author}</span>
                <span class="lang-badge">${getLangName(post.language)}</span>
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
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', ${isLiked})">
                ❤️ 좋아요 ${post.likes?.length || 0}
            </button>
            <button class="comment-toggle" onclick="toggleComments('${post.id}')">
                💬 댓글 ${post.comments?.length || 0}
            </button>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="${isCommentOpen}">
            <div class="comment-list">
                ${post.comments?.map((c, index) => {
                    return `
                    <div class="comment-item">
                        <div class="comment-main">
                            <span class="comment-user" onclick="showUserPosts('${c.uid}')" style="cursor:pointer">${c.user}:</span> 
                            <span class="comment-text">${escapeHtml(c.text)}</span>
                        </div>
                    </div>`;
                }).join('') || ''}
            </div>
            <div class="comment-input-area">
                <input type="text" id="input-${post.id}" placeholder="댓글을 입력하세요...">
                <button onclick="addComment('${post.id}')">등록</button>
            </div>
        </div>
    `;

    div.querySelector('.copy-btn').onclick = () => {
        navigator.clipboard.writeText(post.content);
    };

    return div;
}

window.startEdit = async (postId) => {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
        const data = postSnap.data();
        document.getElementById('code-input').value = data.content;
        document.getElementById('desc-input').value = data.description;
        document.getElementById('language-select').value = data.language;
        editingPostId = postId;
        document.getElementById('post-btn').innerText = "수정 완료";
        document.querySelector('.write-card h3').innerText = "게시물 수정하기";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.deletePost = async (postId) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, "posts", postId)); } catch (e) { console.error(e); }
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
        el.style.display = 'none';
        openCommentsStore.delete(postId);
    } else {
        el.style.display = 'block';
        openCommentsStore.add(postId);
    }
};

window.addComment = async (postId) => {
    const input = document.getElementById(`input-${postId}`);
    if (!auth.currentUser || !input.value.trim()) return;
    await updateDoc(doc(db, "posts", postId), {
        comments: arrayUnion({ 
            user: auth.currentUser.displayName, 
            text: input.value, 
            uid: auth.currentUser.uid,
            likes: [] 
        })
    });
    input.value = "";
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('sort-latest').onclick = () => { currentSort = 'latest'; currentView = 'all'; updateFeed(); };
document.getElementById('sort-popular').onclick = () => { currentSort = 'popular'; updateFeed(); };
document.getElementById('sort-follow').onclick = () => { currentView = 'follow'; updateFeed(); };
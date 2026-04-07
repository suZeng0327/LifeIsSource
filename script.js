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

// [수정] 초기 실행: 페이지 로드 즉시 피드를 먼저 불러옵니다. (멈춤 현상 방지)
updateFeed(); 

const writeArea = document.getElementById('write-area');
const openWriteBtn = document.getElementById('open-write-btn');
const toggleArea = document.getElementById('write-toggle-area');
const cancelWriteBtn = document.getElementById('cancel-write-btn');

function showWriteTemplate() {
    if(!auth.currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }
    writeArea.style.display = 'block';
    toggleArea.style.display = 'none';
}

function hideWriteTemplate() {
    writeArea.style.display = 'none';
    toggleArea.style.display = 'block';
    resetWriteArea();
}

openWriteBtn.onclick = showWriteTemplate;
cancelWriteBtn.onclick = hideWriteTemplate;

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
}

function renderFollowSidebar() {
    const listEl = document.getElementById('follow-list');
    if (!auth.currentUser) { listEl.innerHTML = "로그인이 필요합니다."; return; }
    if (myFollowingList.length === 0) { listEl.innerHTML = "<p>팔로우한 유저가 없습니다.</p>"; return; }
    listEl.innerHTML = myFollowingList.map(u => `
        <div class="follow-item" onclick="showUserPosts('${u.uid}')">👤 ${u.name}</div>
    `).join('');
}

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
                <span class="user-name" onclick="showMyPosts()" style="cursor:pointer">👤 ${user.displayName}님</span> 
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

function goHome() {
    currentView = 'all';
    currentSort = 'latest';
    targetUserUid = null;
    editingPostId = null;
    hideWriteTemplate(); 
    document.getElementById('user-profile-header').style.display = 'none';
    document.getElementById('sort-area').style.display = 'flex';
    renderAuthUI(auth.currentUser, 'all');
    updateFeed();
}
window.goHome = goHome;

async function showMyPosts() {
    if (!auth.currentUser) return;
    currentView = 'my';
    targetUserUid = auth.currentUser.uid;

    writeArea.style.display = 'none'; 
    toggleArea.style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';

    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userSnap.data() || { name: auth.currentUser.displayName, followers: [] };

    const header = document.getElementById('user-profile-header');
    header.style.display = 'block';
    header.innerHTML = `
        <div class="profile-header-card">
            <h2>${userData.name} 님의 페이지</h2>
            <div class="profile-info">팔로워: <b>${userData.followers?.length || 0}</b>명</div>
            <div style="display:flex; justify-content:center; gap:10px;">
                <button class="home-btn" onclick="goHome()">홈으로</button>
            </div>
        </div>
    `;

    renderAuthUI(auth.currentUser, 'my');
    updateFeed();
}
window.showMyPosts = showMyPosts;

window.showUserPosts = async (uid) => {
    if (auth.currentUser && uid === auth.currentUser.uid) {
        showMyPosts();
        return;
    }
    currentView = 'user';
    targetUserUid = uid;
    writeArea.style.display = 'none';
    toggleArea.style.display = 'none';
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

// [수정] 인증 상태 감시 함수: 데이터 로딩과 인증 UI 갱신을 분리하여 실행합니다.
onAuthStateChanged(auth, (user) => {
    syncUserData(user);
    renderAuthUI(user, currentView);
    // 로그인 상태가 변했을 때(로그인/로그아웃)만 피드를 한 번 더 갱신해줍니다.
    updateFeed(); 
});

document.getElementById('post-btn').onclick = async () => {
    const code = document.getElementById('code-input').value;
    const desc = document.getElementById('desc-input').value;
    const lang = document.getElementById('language-select').value;
    if (!auth.currentUser || !code.trim()) return;

    try {
        await addDoc(collection(db, "posts"), {
            author: auth.currentUser.displayName,
            uid: auth.currentUser.uid,
            content: code, description: desc, language: lang,
            createdAt: serverTimestamp(), likes: [], comments: []
        });
        hideWriteTemplate(); 
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
    // [수정] 인증 정보가 없더라도 기본 'all' 뷰는 로드될 수 있도록 조건을 체크합니다.
    if (currentView === 'my' && auth.currentUser) {
        q = query(collection(db, "posts"), where("uid", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
    } else if (currentView === 'user') {
        q = query(collection(db, "posts"), where("uid", "==", targetUserUid), orderBy("createdAt", "desc"));
    } else if (currentView === 'follow' && auth.currentUser) {
        const followUids = myFollowingList.map(u => u.uid);
        if (followUids.length === 0) {
            feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#888;">팔로우한 사람이 없습니다.</p>`;
            return;
        }
        q = query(collection(db, "posts"), where("uid", "in", followUids), orderBy("createdAt", "desc"));
    } else {
        // 기본 전체 피드 로드
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    window.unsubscribeFeed = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        if (currentSort === 'popular') posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        feed.innerHTML = "";
        if (posts.length === 0) {
            feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#888;">표시할 코드가 없습니다.</p>`;
        } else {
            posts.forEach((post) => feed.appendChild(createPostElement(post)));
            document.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
        }
    }, (error) => {
        console.error("Feed Load Error: ", error);
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
        <div class="post-content-view">
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
        </div>
        <div class="comment-section" id="comments-${post.id}" style="${isCommentOpen}">
            <div class="comment-list">
                ${post.comments?.map((c, index) => `
                    <div class="comment-item" id="comment-${post.id}-${index}">
                        <div class="comment-main">
                            <div class="comment-body" style="flex:1;">
                                <span class="comment-user" onclick="showUserPosts('${c.uid}')" style="cursor:pointer">${c.user}:</span>
                                <span class="comment-text">${escapeHtml(c.text)}</span>
                            </div>
                            <div class="comment-actions">
                                <button onclick="toggleCommentLike('${post.id}', ${index})" style="background:none; color:${c.likes?.includes(auth.currentUser?.uid) ? '#ff5252' : '#888'}">♥ ${c.likes?.length || 0}</button>
                                ${auth.currentUser?.uid === c.uid ? `
                                    <button onclick="editComment('${post.id}', ${index}, '${escapeHtml(c.text)}')" title="수정">✎</button>
                                    <button onclick="deleteComment('${post.id}', ${index})" title="삭제">✘</button>
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
    
    const copyBtn = div.querySelector('.copy-btn');
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(post.content).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "✔ 복사됨";
            setTimeout(() => {
                copyBtn.innerText = originalText;
            }, 2000);
        });
    };
    
    return div;
}

window.startEdit = async (postId) => {
    const postDiv = document.getElementById(`post-${postId}`);
    const contentView = postDiv.querySelector('.post-content-view');
    const postSnap = await getDoc(doc(db, "posts", postId));
    const data = postSnap.data();
    contentView.style.display = 'none';
    
    const editForm = document.createElement('div');
    editForm.className = 'inline-edit-form';
    editForm.innerHTML = `
        <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#4caf50;">게시글 수정</strong>
            <select id="edit-lang-${postId}" style="background:#333; color:#fff; border:none; padding:4px; border-radius:4px;">
                <option value="c" ${data.language==='c'?'selected':''}>C</option>
                <option value="cpp" ${data.language==='cpp'?'selected':''}>C++</option>
                <option value="python" ${data.language==='python'?'selected':''}>Python</option>
                <option value="c#" ${data.language==='c#'?'selected':''}>C#</option>
                <option value="java" ${data.language==='java'?'selected':''}>Java</option>
                <option value="javascript" ${data.language==='javascript'?'selected':''}>JavaScript</option>
            </select>
        </div>
        <textarea id="edit-code-${postId}" style="width:100%; height:200px; background:#1e1e1e; color:#9cdcfe; border:1px solid #4caf50; padding:10px; border-radius:8px; font-family:monospace; margin-bottom:10px;">${data.content}</textarea>
        <input type="text" id="edit-desc-${postId}" value="${data.description || ''}" style="width:100%; background:#262626; border:1px solid #444; color:#fff; padding:8px; border-radius:4px; margin-bottom:10px;">
        <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
            <button onclick="saveEdit('${postId}')" style="background:#4caf50; font-size:12px;">수정 완료</button>
            <button onclick="updateFeed()" style="background:#555; font-size:12px;">취소</button>
        </div>
    `;
    postDiv.prepend(editForm);
};

window.saveEdit = async (postId) => {
    const newCode = document.getElementById(`edit-code-${postId}`).value;
    const newDesc = document.getElementById(`edit-desc-${postId}`).value;
    const newLang = document.getElementById(`edit-lang-${postId}`).value;
    if(!newCode.trim()) return;
    await updateDoc(doc(db, "posts", postId), {
        content: newCode, description: newDesc, language: newLang, updatedAt: serverTimestamp()
    });
};

window.addComment = async (postId) => {
    const input = document.getElementById(`input-${postId}`);
    if (!auth.currentUser || !input.value.trim()) return;
    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, {
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

window.editComment = (postId, index, oldText) => {
    const commentDiv = document.getElementById(`comment-${postId}-${index}`);
    const bodyArea = commentDiv.querySelector('.comment-body');
    const actionArea = commentDiv.querySelector('.comment-actions');
    if (commentDiv.classList.contains('is-editing')) return;
    commentDiv.classList.add('is-editing');
    actionArea.style.display = 'none'; 
    bodyArea.innerHTML = `
        <div class="inline-edit-box" style="display:flex; gap:5px; margin-top:5px; width:100%;">
            <input type="text" id="edit-input-${postId}-${index}" value="${oldText}" style="flex:1; background:#333; border:1px solid #4caf50; color:#fff; padding:5px; border-radius:4px; font-size:12px;">
            <button onclick="updateComment('${postId}', ${index}, '${oldText}')" style="padding:2px 8px; font-size:11px; background:#4caf50; color:white; border-radius:4px;">완료</button>
            <button onclick="cancelEditComment()" style="padding:2px 8px; font-size:11px; background:#555; color:white; border-radius:4px;">취소</button>
        </div>
    `;
};

window.cancelEditComment = () => {
    updateFeed();
};

window.updateComment = async (postId, index, oldText) => {
    const input = document.getElementById(`edit-input-${postId}-${index}`);
    const newText = input.value.trim();
    if (!newText) return;
    
    if (newText === oldText) {
        updateFeed();
        return;
    }

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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('sort-latest').onclick = () => { currentSort = 'latest'; currentView = 'all'; updateFeed(); };
document.getElementById('sort-popular').onclick = () => { currentSort = 'popular'; currentView = 'all'; updateFeed(); };
document.getElementById('sort-follow').onclick = () => { currentView = 'follow'; currentSort = 'latest'; updateFeed(); };
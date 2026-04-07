import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, where, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let editingPostId = null;

// [추가] 열려 있는 댓글창 상태를 기억하기 위한 Set
let openCommentsStore = new Set();

function getLangName(lang) {
    if (lang === 'csharp') return 'C#';
    return lang;
}

function updateSortButtons() {
    document.getElementById('sort-latest').classList.toggle('active', currentSort === 'latest');
    document.getElementById('sort-popular').classList.toggle('active', currentSort === 'popular');
}

function renderAuthUI(user, viewMode = 'all') {
    const authSection = document.getElementById('auth-section');
    if (user) {
        let actionBtn = `<button id="my-posts-btn" class="my-posts-btn">내가 쓴 글</button>`;
        if (viewMode === 'my') actionBtn = `<button id="home-btn" class="home-btn">홈으로 돌아가기</button>`;

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
    editingPostId = null;
    resetWriteArea();
    document.getElementById('write-area').style.display = 'block';
    document.getElementById('sort-area').style.display = 'flex';
    renderAuthUI(auth.currentUser, 'all');
    updateFeed();
}

function showMyPosts() {
    if (!auth.currentUser) return;
    currentView = 'my';
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    renderAuthUI(auth.currentUser, 'my');
    updateFeed();
}

document.getElementById('home-logo').onclick = goHome;

onAuthStateChanged(auth, (user) => {
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

    let q = currentView === 'my' 
        ? query(collection(db, "posts"), where("uid", "==", auth.currentUser?.uid), orderBy("createdAt", "desc"))
        : query(collection(db, "posts"), orderBy("createdAt", "desc"));

    window.unsubscribeFeed = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        if (currentSort === 'popular') posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        feed.innerHTML = currentView === 'my' ? `<h2 style="margin-bottom:20px;">내 게시물 목록</h2>` : "";
        if (posts.length === 0) feed.innerHTML += `<p style="color:#888;">게시물이 없습니다.</p>`;

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
    
    // [중요] 리렌더링 시 openCommentsStore에 ID가 있으면 표시함
    const isCommentOpen = openCommentsStore.has(post.id) ? 'display: block;' : 'display: none;';

    div.innerHTML = `
        <div class="post-header">
            <div>
                <span class="post-author">👤 ${post.author}</span>
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
                    const isCUserLiked = c.likes?.includes(auth.currentUser?.uid);
                    return `
                    <div class="comment-item" id="comment-item-${post.id}-${index}">
                        <div class="comment-main">
                            <span class="comment-user">${c.user}:</span> 
                            <span class="comment-text">${escapeHtml(c.text)}</span>
                            <div class="comment-actions">
                                ${auth.currentUser?.uid === c.uid ? `
                                    <button class="c-edit-icon" onclick="startCommentEdit('${post.id}', ${index})">✏️</button>
                                    <button class="c-delete-icon" onclick="deleteComment('${post.id}', ${index})">🗑️</button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="comment-footer">
                            <button class="c-like-btn ${isCUserLiked ? 'liked' : ''}" onclick="toggleCommentLike('${post.id}', ${index}, ${isCUserLiked})">
                                ❤️ ${c.likes?.length || 0}
                            </button>
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

// [수정] 댓글창 토글 시 상태 저장
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

// [수정] 댓글란에서 즉시 수정 가능하도록 변경
window.startCommentEdit = (postId, index) => {
    const commentItem = document.getElementById(`comment-item-${postId}-${index}`);
    const originalText = commentItem.querySelector('.comment-text').innerText;
    
    commentItem.innerHTML = `
        <div class="comment-edit-mode">
            <input type="text" class="edit-comment-input" value="${originalText}">
            <div class="edit-actions">
                <button onclick="saveCommentEdit('${postId}', ${index})">저장</button>
                <button class="cancel-btn" onclick="updateFeed()">취소</button>
            </div>
        </div>
    `;
};

// [추가] 수정한 댓글 저장 로직
window.saveCommentEdit = async (postId, index) => {
    const commentItem = document.getElementById(`comment-item-${postId}-${index}`);
    const newText = commentItem.querySelector('.edit-comment-input').value;
    
    if (!newText.trim()) return;

    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = postSnap.data().comments;
    comments[index].text = newText;
    
    await updateDoc(postRef, { comments });
};

window.deleteComment = async (postId, index) => {
    if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = postSnap.data().comments;
    comments.splice(index, 1);
    
    await updateDoc(postRef, { comments });
};

window.toggleCommentLike = async (postId, index, isLiked) => {
    if (!auth.currentUser) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    const comments = [...postSnap.data().comments];
    
    if (!comments[index].likes) comments[index].likes = [];
    
    if (isLiked) {
        comments[index].likes = comments[index].likes.filter(uid => uid !== auth.currentUser.uid);
    } else {
        comments[index].likes.push(auth.currentUser.uid);
    }
    
    await updateDoc(postRef, { comments });
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('sort-latest').onclick = () => { currentSort = 'latest'; updateFeed(); };
document.getElementById('sort-popular').onclick = () => { currentSort = 'popular'; updateFeed(); };
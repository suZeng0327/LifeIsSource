import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let editingPostId = null; // 수정 중인 게시물 ID 저장

// --- 네비게이션 및 UI 렌더링 ---
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
    if (!auth.currentUser) return alert("로그인이 필요합니다!");
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

// --- 게시물 작성 및 수정 ---
document.getElementById('post-btn').onclick = async () => {
    const code = document.getElementById('code-input').value;
    const desc = document.getElementById('desc-input').value;
    const lang = document.getElementById('language-select').value;
    
    if (!auth.currentUser) return alert("로그인 후 이용해 주세요!");
    if (!code.trim()) return alert("코드를 입력하세요!");

    try {
        if (editingPostId) {
            // 수정 모드
            await updateDoc(doc(db, "posts", editingPostId), {
                content: code,
                description: desc,
                language: lang,
                updatedAt: serverTimestamp()
            });
            alert("게시물이 수정되었습니다!");
            editingPostId = null;
        } else {
            // 새 글 쓰기
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
            alert("성공적으로 공유되었습니다!");
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
}

// --- 피드 업데이트 및 게시물 엘리먼트 생성 ---
function updateFeed() {
    if (window.unsubscribeFeed) window.unsubscribeFeed();
    const feed = document.getElementById('feed');
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
    div.innerHTML = `
        <div class="post-header">
            <div>
                <span class="post-author">👤 ${post.author}</span>
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
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', ${isLiked})">
                ❤️ 좋아요 ${post.likes?.length || 0}
            </button>
            <button class="comment-toggle" onclick="toggleComments('${post.id}')">
                💬 댓글 ${post.comments?.length || 0}
            </button>
        </div>
        <div class="comment-section" id="comments-${post.id}">
            <div class="comment-list">
                ${post.comments?.map(c => `<div class="comment-item"><span class="comment-user">${c.user}:</span> ${c.text}</div>`).join('') || ''}
            </div>
            <div class="comment-input-area">
                <input type="text" id="input-${post.id}" placeholder="댓글을 입력하세요...">
                <button onclick="addComment('${post.id}')">등록</button>
            </div>
        </div>
    `;

    // 개선된 복사 기능 (이벤트 리스너 방식)
    div.querySelector('.copy-btn').onclick = () => {
        navigator.clipboard.writeText(post.content).then(() => alert("코드가 복사되었습니다!"));
    };

    return div;
}

// --- 수정/삭제/기타 기능 ---
window.startEdit = async (postId) => {
    const postSnap = await doc(db, "posts", postId);
    // 실제 데이터를 다시 가져와서 입력칸에 세팅
    onSnapshot(postSnap, (doc) => {
        const data = doc.data();
        document.getElementById('code-input').value = data.content;
        document.getElementById('desc-input').value = data.description;
        document.getElementById('language-select').value = data.language;
        editingPostId = postId;
        document.getElementById('post-btn').innerText = "수정 완료";
        document.querySelector('.write-card h3').innerText = "게시물 수정하기";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
};

window.deletePost = async (postId) => {
    if (!confirm("정말 이 게시물을 삭제하시겠습니까? 관련 댓글과 좋아요도 모두 삭제됩니다.")) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        alert("삭제되었습니다.");
    } catch (e) { alert("삭제 권한이 없습니다."); }
};

window.toggleLike = async (postId, isLiked) => {
    if (!auth.currentUser) return alert("로그인하세요!");
    await updateDoc(doc(db, "posts", postId), {
        likes: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
    });
};

window.toggleComments = (postId) => {
    const el = document.getElementById(`comments-${postId}`);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
};

window.addComment = async (postId) => {
    const input = document.getElementById(`input-${postId}`);
    if (!auth.currentUser) return alert("로그인하세요!");
    if (!input.value.trim()) return;
    await updateDoc(doc(db, "posts", postId), {
        comments: arrayUnion({ user: auth.currentUser.displayName, text: input.value, uid: auth.currentUser.uid })
    });
    input.value = "";
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('sort-latest').onclick = () => { currentSort = 'latest'; updateFeed(); };
document.getElementById('sort-popular').onclick = () => { currentSort = 'popular'; updateFeed(); };
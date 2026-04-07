import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// --- 버튼 업데이트 함수 (성훈님 요청: 내가 쓴 글 <-> 홈으로 버튼 교체) ---
function renderAuthUI(user, viewMode = 'all') {
    const authSection = document.getElementById('auth-section');
    if (user) {
        let actionBtn = `<button id="my-posts-btn" class="my-posts-btn">내가 쓴 글</button>`;
        if (viewMode === 'my') {
            actionBtn = `<button id="home-btn" class="home-btn">홈으로 돌아가기</button>`;
        }

        authSection.innerHTML = `
            <div class="user-info">
                ${actionBtn}
                <span class="user-name">👤 ${user.displayName}님</span> 
                <button id="logout-btn" class="logout-style">로그아웃</button>
            </div>
        `;
        
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        if (document.getElementById('my-posts-btn')) {
            document.getElementById('my-posts-btn').onclick = showMyPosts;
        }
        if (document.getElementById('home-btn')) {
            document.getElementById('home-btn').onclick = goHome;
        }
    } else {
        authSection.innerHTML = `<button id="login-btn">구글 로그인</button>`;
        document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
    }
}

// 홈으로 가기 로직
function goHome() {
    currentView = 'all';
    document.getElementById('write-area').style.display = 'block';
    document.getElementById('sort-area').style.display = 'flex';
    renderAuthUI(auth.currentUser, 'all');
    updateFeed();
}

// 내 글 보기 로직
function showMyPosts() {
    if (!auth.currentUser) return alert("로그인이 필요합니다!");
    currentView = 'my';
    document.getElementById('write-area').style.display = 'none';
    document.getElementById('sort-area').style.display = 'none';
    renderAuthUI(auth.currentUser, 'my');
    updateFeed();
}

// 로고 클릭 시 홈으로
document.getElementById('home-logo').onclick = goHome;

onAuthStateChanged(auth, (user) => {
    renderAuthUI(user, currentView);
    updateFeed();
});

// 정렬 버튼 이벤트
document.getElementById('sort-latest').onclick = function() {
    currentSort = 'latest';
    this.classList.add('active');
    document.getElementById('sort-popular').classList.remove('active');
    updateFeed();
};
document.getElementById('sort-popular').onclick = function() {
    currentSort = 'popular';
    this.classList.add('active');
    document.getElementById('sort-latest').classList.remove('active');
    updateFeed();
};

// 게시물 저장
document.getElementById('post-btn').onclick = async () => {
    const code = document.getElementById('code-input').value;
    const desc = document.getElementById('desc-input').value;
    const lang = document.getElementById('language-select').value;
    
    if (!auth.currentUser) return alert("로그인 후 이용해 주세요!");
    if (!code.trim()) return alert("코드를 입력하세요!");

    try {
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
        document.getElementById('code-input').value = "";
        document.getElementById('desc-input').value = "";
        alert("성공적으로 공유되었습니다!");
    } catch (e) {
        console.error(e);
    }
};

// 피드 업데이트
let unsubscribe = null;
function updateFeed() {
    if (unsubscribe) unsubscribe();
    const feed = document.getElementById('feed');
    let q;
    
    if (currentView === 'my') {
        // 내 글만 가져오기 필터
        q = query(collection(db, "posts"), where("uid", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    unsubscribe = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

        if (currentSort === 'popular') {
            posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
        }

        feed.innerHTML = currentView === 'my' ? `<h2 style="margin-bottom:20px;">내 게시물 목록</h2>` : "";
        
        if (posts.length === 0) {
            feed.innerHTML += `<p style="color:#888;">게시물이 없습니다.</p>`;
        }

        posts.forEach((post) => {
            feed.appendChild(createPostElement(post));
        });
        document.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
    }, (error) => {
        console.error("피드 로딩 에러:", error);
        if (error.code === 'failed-precondition') {
            alert("Firestore 인덱스 설정이 필요합니다. 콘솔의 링크를 클릭해 인덱스를 생성하세요.");
        }
    });
}

function createPostElement(post) {
    const isLiked = post.likes?.includes(auth.currentUser?.uid);
    const date = post.createdAt?.toDate().toLocaleString() || "방금 전";
    
    const div = document.createElement('div');
    div.className = 'post';
    div.innerHTML = `
        <div class="post-header">
            <span>👤 ${post.author}</span>
            <span><span class="lang-badge">${post.language}</span> · ${date}</span>
        </div>
        ${post.description ? `<div class="post-desc">${post.description}</div>` : ''}
        <pre><button class="copy-btn" onclick="copyToClipboard(\`${post.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">복사</button><code class="language-${post.language}">${escapeHtml(post.content)}</code></pre>
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
    return div;
}

window.toggleLike = async (postId, isLiked) => {
    if (!auth.currentUser) return alert("로그인하세요!");
    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
    });
};

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => alert("복사 완료!"));
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
        comments: arrayUnion({
            user: auth.currentUser.displayName,
            text: input.value,
            uid: auth.currentUser.uid
        })
    });
    input.value = "";
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
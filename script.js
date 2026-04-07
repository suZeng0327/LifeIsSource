import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyBv05NaIqSaenLVsnGihFee8eRNHJ1ldYs",
  authDomain: "lifeissource.firebaseapp.com",
  projectId: "lifeissource",
  storageBucket: "lifeissource.firebasestorage.app",
  messagingSenderId: "153999974394",
  appId: "1:153999974394:web:0a39d28d4ad4280e69ce43",
  measurementId: "G-85QEHFWL84"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const provider = new GoogleAuthProvider();

const authSection = document.getElementById('auth-section');
const postBtn = document.getElementById('post-btn');
const codeInput = document.getElementById('code-input');
const feed = document.getElementById('feed');

// 로그인/로그아웃 함수
async function handleLogin() {
    try { await signInWithPopup(auth, provider); } 
    catch (err) { console.error("로그인 에러:", err); }
}

async function handleLogout() {
    try { await signOut(auth); } 
    catch (err) { console.error("로그아웃 에러:", err); }
}

// 2. 로그인 상태 체크 (이름표시 핵심 로직)
onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.innerHTML = `
            <div class="user-info">
                <span class="user-name">👤 ${user.displayName}님</span> 
                <button id="logout-btn" class="logout-style">로그아웃</button>
            </div>
        `;
        document.getElementById('logout-btn').onclick = handleLogout;
    } else {
        authSection.innerHTML = `<button id="login-btn">구글 로그인</button>`;
        document.getElementById('login-btn').onclick = handleLogin;
    }
});

// 3. 게시물 저장
postBtn.onclick = async () => {
    const code = codeInput.value;
    if (!auth.currentUser) return alert("먼저 로그인해 주세요!");
    if (!code.trim()) return alert("코드를 입력하세요!");

    try {
        await addDoc(collection(db, "posts"), {
            author: auth.currentUser.displayName,
            content: code,
            createdAt: serverTimestamp(),
            uid: auth.currentUser.uid
        });
        codeInput.value = "";
    } catch (err) { console.error(err); }
};

// 4. 피드 실시간 업데이트
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
    feed.innerHTML = "";
    snapshot.forEach((doc) => {
        const post = doc.data();
        const date = post.createdAt ? post.createdAt.toDate().toLocaleString() : "작성 중...";
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.innerHTML = `
            <div class="post-header">👤 ${post.author} · ${date}</div>
            <pre><code>${escapeHtml(post.content)}</code></pre>
        `;
        feed.appendChild(postDiv);
    });
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
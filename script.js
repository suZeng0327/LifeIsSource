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

// 운영자 정보
const ADMIN_UID = "K78dphO3rUO1KkZ1nXXoDmlfAk82";
const ADMIN_EMAIL = "suzeng0327@gmail.com";

let currentView = 'all'; 
let currentSort = 'latest'; 
let targetUserUid = null;
let editingPostId = null;
let openCommentsStore = new Set();
let myFollowingList = []; 
let searchQuery = ""; // 검색어 상태 유지

// 초기화 실행
updateFeed(); 
loadNotices(); // 공지사항 로드 함수 호출

const writeArea = document.getElementById('write-area');
const openWriteBtn = document.getElementById('open-write-btn');
const toggleArea = document.getElementById('write-toggle-area');
const cancelWriteBtn = document.getElementById('cancel-write-btn');

// 본문 통합 검색창 이벤트 리스너
document.getElementById('mobile-search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    updateFeed();
});

function showWriteTemplate() {
    if(!auth.currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }
    writeArea.style.display = 'block';
    toggleArea.style.display = 'none';
    
    // 운영자일 경우 공지사항 체크박스 표시 로직
    const noticeLabel = document.getElementById('notice-label');
    if (noticeLabel) {
        const isUserAdmin = auth.currentUser.uid === ADMIN_UID || auth.currentUser.email === ADMIN_EMAIL;
        if (isUserAdmin) {
            noticeLabel.style.display = 'flex'; 
        } else {
            noticeLabel.style.display = 'none';
        }
    }
}

function hideWriteTemplate() {
    writeArea.style.display = 'none';
    toggleArea.style.display = 'block';
    resetWriteArea();
}

if(openWriteBtn) openWriteBtn.onclick = showWriteTemplate;
if(cancelWriteBtn) cancelWriteBtn.onclick = hideWriteTemplate;

async function syncUserData(user) {
    if (!user) {
        myFollowingList = [];
        renderFollowSidebar();
        return;
    }
    const userRef = doc(db, "users", user.uid);
    
    // [수정 핵심]: 기존 정보를 덮어쓰지 않도록 setDoc에 merge: true 사용
    await setDoc(userRef, { 
        name: user.displayName, 
        photoURL: user.photoURL,
        email: user.email 
    }, { merge: true });

    onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            myFollowingList = doc.data()?.following || [];
            renderFollowSidebar();
            // 팔로우 탭이나 프로필 페이지 상태를 실시간 반영
            if(currentView === 'follow' || currentView === 'user') updateFeed();
        }
    });
}

function renderFollowSidebar() {
    const listEl = document.getElementById('follow-list');
    if (!listEl) return;
    if (!auth.currentUser) { listEl.textContent = "로그인이 필요합니다."; return; }
    
    if (myFollowingList.length === 0) { 
        listEl.innerHTML = "<p style='color:#888; font-size:0.85rem;'>팔로우한 사람이 없습니다.</p>"; 
        return; 
    }
    
    listEl.innerHTML = "";
    myFollowingList.forEach(u => {
        const item = document.createElement('div');
        item.className = 'follow-item';
        item.textContent = `👤 ${u.name}`;
        item.style.cursor = "pointer";
        item.style.padding = "5px 0";
        item.onclick = () => showUserPosts(u.uid);
        listEl.appendChild(item);
    });
}

function loadNotices() {
    const q = query(collection(db, "posts"), where("isNotice", "==", true), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const noticeList = document.getElementById('notice-list');
        if (!noticeList) return;
        noticeList.innerHTML = "";
        
        if (snapshot.empty) {
            noticeList.innerHTML = "<p style='color:#666;'>공지사항이 없습니다.</p>";
            return;
        }
        
        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            const item = document.createElement('div');
            item.className = 'notice-item';
            item.style = "padding: 8px 0; border-bottom: 1px solid #333; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem;";
            
            const title = post.description || "제목 없는 공지";
            item.textContent = `📌 ${title}`;
            
            item.onclick = () => {
                const targetPost = document.getElementById(`post-${docSnap.id}`);
                if (targetPost) {
                    targetPost.scrollIntoView({ behavior: 'smooth' });
                    targetPost.style.boxShadow = "0 0 15px #4caf50";
                    setTimeout(() => targetPost.style.boxShadow = "none", 2000);
                } else {
                    alert("홈 화면에서 해당 공지사항을 확인하실 수 있습니다.");
                    goHome();
                }
            };
            noticeList.appendChild(item);
        });
    });
}

function updateSortButtons() {
    const btnLatest = document.getElementById('sort-latest');
    const btnPopular = document.getElementById('sort-popular');
    const btnFollow = document.getElementById('sort-follow');

    if (!btnLatest || !btnPopular || !btnFollow) return;

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
    if (!authSection) return;
    authSection.innerHTML = ""; 

    if (user) {
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';

        const actionBtn = document.createElement('button');
        if (viewMode === 'my' || viewMode === 'user') {
            actionBtn.className = 'home-btn';
            actionBtn.textContent = '홈으로';
            actionBtn.onclick = goHome;
        } else {
            actionBtn.className = 'my-posts-btn';
            actionBtn.textContent = '내가 쓴 글';
            actionBtn.onclick = showMyPosts;
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-name';
        nameSpan.style.cursor = 'pointer';
        nameSpan.textContent = `👤 ${user.displayName}님`;
        nameSpan.onclick = showMyPosts;

        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'logout-style';
        logoutBtn.textContent = '로그아웃';
        logoutBtn.onclick = () => signOut(auth);

        userInfo.appendChild(actionBtn);
        userInfo.appendChild(nameSpan);
        userInfo.appendChild(logoutBtn);
        authSection.appendChild(userInfo);
        
    } else {
        const loginDiv = document.createElement('div');
        loginDiv.style.display = 'flex';
        loginDiv.style.alignItems = 'center';
        loginDiv.style.gap = '10px';

        const loginBtn = document.createElement('button');
        loginBtn.textContent = '구글 로그인';
        loginBtn.onclick = () => signInWithPopup(auth, provider);

        loginDiv.appendChild(loginBtn);
        authSection.appendChild(loginDiv);
    }
}

function goHome() {
    currentView = 'all';
    currentSort = 'latest';
    targetUserUid = null;
    editingPostId = null;
    searchQuery = ""; 
    const searchInput = document.getElementById('mobile-search-input');
    if(searchInput) searchInput.value = "";
    
    hideWriteTemplate(); 
    document.getElementById('user-profile-header').style.display = 'none';
    const sortArea = document.getElementById('sort-area');
    if(sortArea) sortArea.style.display = 'flex';
    
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
    const sortArea = document.getElementById('sort-area');
    if(sortArea) sortArea.style.display = 'none';

    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userSnap.data() || { name: auth.currentUser.displayName, followers: [] };

    const header = document.getElementById('user-profile-header');
    header.style.display = 'block';
    header.innerHTML = ""; 

    const card = document.createElement('div');
    card.className = 'profile-header-card';
    
    const title = document.createElement('h2');
    title.textContent = `${userData.name} 님의 페이지`;
    
    const info = document.createElement('div');
    info.className = 'profile-info';
    info.innerHTML = `팔로워: <b>${userData.followers?.length || 0}</b>명`;

    const btnDiv = document.createElement('div');
    btnDiv.style.display = 'flex';
    btnDiv.style.justifyContent = 'center';
    btnDiv.style.gap = '10px';
    
    const hBtn = document.createElement('button');
    hBtn.className = 'home-btn';
    hBtn.textContent = '홈으로';
    hBtn.onclick = goHome;

    btnDiv.appendChild(hBtn);
    card.appendChild(title);
    card.appendChild(info);
    card.appendChild(btnDiv);
    header.appendChild(card);

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
    const sortArea = document.getElementById('sort-area');
    if(sortArea) sortArea.style.display = 'none';
    
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.exists() ? userSnap.data() : { name: "알 수 없는 사용자", followers: [] };
    const isFollowing = myFollowingList.some(u => u.uid === uid);

    const header = document.getElementById('user-profile-header');
    header.style.display = 'block';
    header.innerHTML = "";

    const card = document.createElement('div');
    card.className = 'profile-header-card';
    
    const title = document.createElement('h2');
    title.textContent = `${userData.name} 님의 페이지`;
    
    const info = document.createElement('div');
    info.className = 'profile-info';
    info.innerHTML = `팔로워: <b>${userData.followers?.length || 0}</b>명`;

    const btnDiv = document.createElement('div');
    btnDiv.style.display = 'flex';
    btnDiv.style.justifyContent = 'center';
    btnDiv.style.gap = '10px';

    if (auth.currentUser?.uid !== uid) {
        const fBtn = document.createElement('button');
        fBtn.className = `follow-btn ${isFollowing ? 'following' : ''}`;
        fBtn.textContent = isFollowing ? '팔로잉' : '팔로우';
        fBtn.onclick = () => toggleFollow(uid, userData.name, isFollowing);
        btnDiv.appendChild(fBtn);
    }
    
    const hBtn = document.createElement('button');
    hBtn.className = 'home-btn';
    hBtn.textContent = '홈으로';
    hBtn.onclick = goHome;

    btnDiv.appendChild(hBtn);
    card.appendChild(title);
    card.appendChild(info);
    card.appendChild(btnDiv);
    header.appendChild(card);
    
    renderAuthUI(auth.currentUser, 'user');
    updateFeed();
};

// [수정 핵심]: toggleFollow 함수 보강
window.toggleFollow = async (uid, name, isFollowing) => {
    if (!auth.currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }
    const myRef = doc(db, "users", auth.currentUser.uid);
    const targetRef = doc(db, "users", uid);

    try {
        if (isFollowing) {
            const updatedList = myFollowingList.filter(u => u.uid !== uid);
            await updateDoc(myRef, { following: updatedList });
            await updateDoc(targetRef, { followers: arrayRemove(auth.currentUser.uid) });
        } else {
            // [수정]: setDoc과 merge를 사용하여 문서 유실 방지
            await setDoc(myRef, { 
                following: arrayUnion({ uid: uid, name: name }) 
            }, { merge: true });
            
            await setDoc(targetRef, { 
                followers: arrayUnion(auth.currentUser.uid) 
            }, { merge: true });
        }
        
        // UI 즉시 업데이트를 위해 프로필 다시 렌더링
        if (currentView === 'user') showUserPosts(uid);
        
    } catch (e) {
        console.error("Follow Toggle Error:", e);
        alert("팔로우 처리 중 오류가 발생했습니다.");
    }
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
    
    const noticeCheckbox = document.getElementById('is-notice-checkbox');
    const isNotice = noticeCheckbox ? noticeCheckbox.checked : false;

    if (!auth.currentUser || !code.trim()) return;

    try {
        await addDoc(collection(db, "posts"), {
            author: auth.currentUser.displayName,
            uid: auth.currentUser.uid,
            content: code, 
            description: desc, 
            language: lang,
            isNotice: isNotice, 
            createdAt: serverTimestamp(), 
            likes: [], 
            comments: []
        });
        hideWriteTemplate(); 
    } catch (e) { console.error("Post Create Error:", e); }
};

function resetWriteArea() {
    document.getElementById('code-input').value = "";
    document.getElementById('desc-input').value = "";
    document.getElementById('language-select').value = "plaintext";
    const noticeCheckbox = document.getElementById('is-notice-checkbox');
    if (noticeCheckbox) noticeCheckbox.checked = false;
    document.getElementById('post-btn').innerText = "공유하기";
    const h3 = document.querySelector('.write-card h3');
    if(h3) h3.innerText = "새 코드 공유하기";
    editingPostId = null;
}

function updateFeed() {
    if (window.unsubscribeFeed) window.unsubscribeFeed();
    const feed = document.getElementById('feed');
    if(!feed) return;
    updateSortButtons();

    if (currentView === 'follow' && !auth.currentUser) {
        feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#888;">로그인이 필요한 서비스입니다.</p>`;
        return;
    }

    let q;
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
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    window.unsubscribeFeed = onSnapshot(q, (snapshot) => {
        let posts = [];
        snapshot.forEach(docSnap => posts.push({ id: docSnap.id, ...docSnap.data() }));
        
        if (searchQuery) {
            posts = posts.filter(post => 
                (post.description && post.description.toLowerCase().includes(searchQuery)) || 
                (post.content && post.content.toLowerCase().includes(searchQuery)) ||
                (post.author && post.author.toLowerCase().includes(searchQuery))
            );
        }

        if (currentSort === 'popular') posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        feed.innerHTML = "";
        if (posts.length === 0) {
            const emptyMsg = currentView === 'follow' ? "팔로우한 사람의 새 글이 없습니다." : "표시할 코드가 없습니다.";
            feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#888;">${emptyMsg}</p>`;
        } else {
            posts.forEach((post) => feed.appendChild(createPostElement(post)));
            document.querySelectorAll('pre code').forEach((el) => {
                hljs.highlightElement(el);
            });
        }
    }, (error) => {
        console.error("Feed Load Error: ", error);
        if(error.code === 'permission-denied') {
            feed.innerHTML = `<p style="text-align:center; margin-top:50px; color:#ff5252;">데이터 접근 권한이 없습니다.</p>`;
        }
    });
}

function createPostElement(post) {
    const isOwner = auth.currentUser?.uid === post.uid;
    const isLiked = post.likes?.includes(auth.currentUser?.uid);
    const date = post.createdAt?.toDate().toLocaleString() || "방금 전";
    const div = document.createElement('div');
    div.className = 'post';
    div.id = `post-${post.id}`;
    
    if (post.isNotice) {
        div.style.border = "1px solid #4caf50";
        div.style.background = "rgba(76, 175, 80, 0.05)";
    }
    const isCommentOpen = openCommentsStore.has(post.id) ? 'display: block;' : 'display: none;';

    div.innerHTML = `
        <div class="post-content-view">
            <div class="post-header">
                <div>
                    ${post.isNotice ? '<span style="color:#4caf50; font-weight:bold; margin-right:5px;">[공지]</span>' : ''}
                    <span class="post-author" style="cursor:pointer">👤 ${escapeHtml(post.author)}</span>
                    <span class="lang-badge">${escapeHtml(post.language)}</span>
                </div>
                <div class="header-right">
                    <span class="post-date">${date}</span>
                    ${isOwner ? `
                        <button class="edit-btn" id="edit-post-${post.id}">수정</button>
                        <button class="delete-btn" id="delete-post-${post.id}">삭제</button>
                    ` : ''}
                </div>
            </div>
            ${post.description ? `<div class="post-desc">${escapeHtml(post.description)}</div>` : ''}
            <pre><button class="copy-btn">복사</button><code class="language-${post.language}">${escapeHtml(post.content)}</code></pre>
            <div class="post-footer">
                <button class="like-btn ${isLiked ? 'liked' : ''}" id="like-post-${post.id}">❤️ 좋아요 ${post.likes?.length || 0}</button>
                <button class="comment-toggle" id="comment-toggle-${post.id}">💬 댓글 ${post.comments?.length || 0}</button>
            </div>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="${isCommentOpen}">
            <div class="comment-list" id="comment-list-${post.id}">
                </div>
            <div class="comment-input-area">
                <input type="text" id="input-${post.id}" placeholder="댓글을 입력하세요...">
                <button id="add-comment-${post.id}">등록</button>
            </div>
        </div>
    `;

    div.querySelector('.post-author').onclick = () => showUserPosts(post.uid);
    if(isOwner) {
        div.querySelector(`#edit-post-${post.id}`).onclick = () => startEdit(post.id);
        div.querySelector(`#delete-post-${post.id}`).onclick = () => deletePost(post.id);
    }
    div.querySelector(`#like-post-${post.id}`).onclick = () => toggleLike(post.id, isLiked);
    div.querySelector(`#comment-toggle-${post.id}`).onclick = () => toggleComments(post.id);
    div.querySelector(`#add-comment-${post.id}`).onclick = () => addComment(post.id);

    const commentListEl = div.querySelector(`#comment-list-${post.id}`);
    if (post.comments) {
        post.comments.forEach((c, index) => {
            const commentItem = document.createElement('div');
            commentItem.className = 'comment-item';
            commentItem.id = `comment-${post.id}-${index}`;
            
            commentItem.innerHTML = `
                <div class="comment-main">
                    <div class="comment-body" style="flex:1;">
                        <span class="comment-user" style="cursor:pointer">${escapeHtml(c.user)}:</span>
                        <span class="comment-text">${escapeHtml(c.text)}</span>
                    </div>
                    <div class="comment-actions">
                        <button class="c-like-btn" style="background:none; color:${c.likes?.includes(auth.currentUser?.uid) ? '#ff5252' : '#888'}">♥ ${c.likes?.length || 0}</button>
                        ${auth.currentUser?.uid === c.uid ? `
                            <button class="c-edit-btn" title="수정">✎</button>
                            <button class="c-delete-btn" title="삭제">✘</button>
                        ` : ''}
                    </div>
                </div>
            `;
            
            commentItem.querySelector('.comment-user').onclick = () => showUserPosts(c.uid);
            commentItem.querySelector('.c-like-btn').onclick = () => toggleCommentLike(post.id, index);
            if(auth.currentUser?.uid === c.uid) {
                commentItem.querySelector('.c-edit-btn').onclick = () => editComment(post.id, index, c.text);
                commentItem.querySelector('.c-delete-btn').onclick = () => deleteComment(post.id, index);
            }
            commentListEl.appendChild(commentItem);
        });
    }

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
    
    if (postDiv.querySelector('.inline-edit-form')) return;

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
        <textarea id="edit-code-${postId}" style="width:100%; height:200px; background:#1e1e1e; color:#9cdcfe; border:1px solid #4caf50; padding:10px; border-radius:8px; font-family:monospace; margin-bottom:10px;"></textarea>
        <input type="text" id="edit-desc-${postId}" style="width:100%; background:#262626; border:1px solid #444; color:#fff; padding:8px; border-radius:4px; margin-bottom:10px;">
        <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
            <button id="save-edit-btn-${postId}" style="background:#4caf50; font-size:12px; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">수정 완료</button>
            <button id="cancel-edit-btn-${postId}" style="background:#555; font-size:12px; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">취소</button>
        </div>
    `;
    editForm.querySelector(`#edit-code-${postId}`).value = data.content;
    editForm.querySelector(`#edit-desc-${postId}`).value = data.description || '';
    
    postDiv.prepend(editForm);

    document.getElementById(`save-edit-btn-${postId}`).onclick = () => saveEdit(postId);
    document.getElementById(`cancel-edit-btn-${postId}`).onclick = () => {
        editForm.remove();
        contentView.style.display = 'block';
    };
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
    
    const originalBodyHTML = bodyArea.innerHTML;
    actionArea.style.display = 'none'; 

    bodyArea.innerHTML = `
        <div class="inline-edit-box" style="display:flex; gap:5px; margin-top:5px; width:100%;">
            <input type="text" id="edit-input-${postId}-${index}" style="flex:1; background:#333; border:1px solid #4caf50; color:#fff; padding:5px; border-radius:4px; font-size:12px;">
            <button id="submit-edit-${postId}-${index}" style="padding:2px 8px; font-size:11px; background:#4caf50; color:white; border-radius:4px; border:none; cursor:pointer;">완료</button>
            <button id="cancel-edit-${postId}-${index}" style="padding:2px 8px; font-size:11px; background:#555; color:white; border-radius:4px; border:none; cursor:pointer;">취소</button>
        </div>
    `;
    bodyArea.querySelector('input').value = oldText;

    document.getElementById(`submit-edit-${postId}-${index}`).onclick = () => {
        updateComment(postId, index, oldText);
    };

    document.getElementById(`cancel-edit-${postId}-${index}`).onclick = () => {
        commentDiv.classList.remove('is-editing');
        bodyArea.innerHTML = originalBodyHTML;
        actionArea.style.display = 'flex';
    };
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
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;   
}

const btnLatest = document.getElementById('sort-latest');
if(btnLatest) btnLatest.onclick = () => { currentSort = 'latest'; currentView = 'all'; updateFeed(); };

const btnPopular = document.getElementById('sort-popular');
if(btnPopular) btnPopular.onclick = () => { currentSort = 'popular'; currentView = 'all'; updateFeed(); };

const btnFollowSort = document.getElementById('sort-follow');
if(btnFollowSort) btnFollowSort.onclick = () => { currentView = 'follow'; currentSort = 'latest'; updateFeed(); };
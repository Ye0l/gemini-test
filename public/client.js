document.addEventListener('DOMContentLoaded', () => {
    M.AutoInit(); // Initialize Materialize components
    const socket = io();

    let currentNickname = localStorage.getItem('nickname') || '';
    const nicknameModal = M.Modal.getInstance(document.getElementById('nickname-modal'));
    const nicknameInput = document.getElementById('nickname-input');
    const saveNicknameBtn = document.getElementById('save-nickname-btn');

    // Show nickname modal if not set
    if (!currentNickname) {
        nicknameModal.open();
    } else {
        nicknameInput.value = currentNickname;
        M.updateTextFields(); // Update Materialize labels
    }

    saveNicknameBtn.addEventListener('click', () => {
        const newNickname = nicknameInput.value.trim();
        if (newNickname) {
            currentNickname = newNickname;
            localStorage.setItem('nickname', newNickname);
            M.toast({ html: `닉네임이 ${newNickname}으로 설정되었습니다.`, classes: 'green darken-2' });
        } else {
            M.toast({ html: '닉네임을 입력해주세요.', classes: 'red darken-2' });
            nicknameModal.open(); // Re-open if empty
        }
    });

    // Initialize tabs
    const tabs = M.Tabs.init(document.querySelector('.tabs'));

    // --- Bulletin Board Logic ---
    const postTitleInput = document.getElementById('post-title');
    const postContentTextarea = document.getElementById('post-content');
    const submitPostBtn = document.getElementById('submit-post');
    const postsContainer = document.getElementById('posts-container');

    // Function to add a post to the DOM
    const addPostToDOM = (post) => {
        const postElement = document.createElement('div');
        postElement.classList.add('card', 'post-item');
        postElement.setAttribute('data-post-id', post.id);
        postElement.innerHTML = `
            <div class="card-content white-text">
                <span class="card-title">${post.title}</span>
                <p>${post.content}</p>
                <p class="right-align"><small>Posted: ${new Date(post.createdAt).toLocaleString()}</small></p>
                <div class="reactions-section" data-post-id="${post.id}">
                    <button class="reaction-button" data-emoji="👍">👍 <span class="reaction-count">${post.Reactions ? post.Reactions.filter(r => r.emoji === '👍').length : 0}</span></button>
                    <button class="reaction-button" data-emoji="❤️">❤️ <span class="reaction-count">${post.Reactions ? post.Reactions.filter(r => r.emoji === '❤️').length : 0}</span></button>
                    <button class="reaction-button" data-emoji="😂">😂 <span class="reaction-count">${post.Reactions ? post.Reactions.filter(r => r.emoji === '😂').length : 0}</span></button>
                </div>
                <div class="comments-section" data-post-id="${post.id}">
                    <h6>댓글</h6>
                    <div class="comments-list"></div>
                    <div class="input-field">
                        <input type="text" class="comment-input validate white-text" placeholder="댓글을 입력하세요...">
                        <button class="btn waves-effect waves-light deep-purple accent-2 comment-submit-btn">댓글 달기</button>
                    </div>
                </div>
            </div>
        `;

        // Add existing comments
        const commentsList = postElement.querySelector('.comments-list');
        if (post.Comments) {
            post.Comments.forEach(comment => {
                const commentItem = document.createElement('div');
                commentItem.classList.add('comment-item');
                commentItem.innerHTML = `<strong>${comment.username}:</strong> ${comment.content} <small class="grey-text text-lighten-1">${new Date(comment.timestamp).toLocaleString()}</small>`;
                commentsList.appendChild(commentItem);
            });
        }

        postsContainer.prepend(postElement);

        // Attach event listeners for comments and reactions
        postElement.querySelector('.comment-submit-btn').addEventListener('click', async (e) => {
            const commentInput = e.target.previousElementSibling;
            const content = commentInput.value.trim();
            if (content && currentNickname) {
                try {
                    await fetch(`/api/posts/${post.id}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: currentNickname, content })
                    });
                    commentInput.value = '';
                } catch (error) {
                    console.error('Error submitting comment:', error);
                }
            } else if (!currentNickname) {
                M.toast({ html: '닉네임을 먼저 설정해주세요.', classes: 'red darken-2' });
                nicknameModal.open();
            }
        });

        postElement.querySelectorAll('.reaction-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const emoji = e.currentTarget.dataset.emoji;
                if (currentNickname) {
                    try {
                        await fetch(`/api/posts/${post.id}/reactions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: currentNickname, emoji })
                        });
                    } catch (error) {
                        console.error('Error submitting reaction:', error);
                    }
                } else {
                    M.toast({ html: '닉네임을 먼저 설정해주세요.', classes: 'red darken-2' });
                    nicknameModal.open();
                }
            });
        });
    };

    // Function to fetch and display posts
    const fetchPosts = async () => {
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts
            posts.forEach(post => addPostToDOM(post));
        } catch (error) {
            console.error('Error fetching posts:', error);
        }
    };

    // Initial fetch of posts
    fetchPosts();

    // Handle new post submission
    submitPostBtn.addEventListener('click', async () => {
        const title = postTitleInput.value;
        const content = postContentTextarea.value;

        if (!currentNickname) {
            M.toast({ html: '닉네임을 먼저 설정해주세요.', classes: 'red darken-2' });
            nicknameModal.open();
            return;
        }

        if (title && content) {
            try {
                const response = await fetch('/api/posts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ title, content })
                });
                if (response.ok) {
                    postTitleInput.value = '';
                    postContentTextarea.value = '';
                    M.textareaAutoResize(postContentTextarea); // Reset textarea height
                    // Post will be added via socket.io 'newPost' event
                } else {
                    console.error('Failed to submit post');
                }
            } catch (error) {
                console.error('Error submitting post:', error);
            }
        } else {
            M.toast({ html: '제목과 내용을 모두 입력해주세요.', classes: 'red darken-2' });
        }
    });

    // Listen for new post events from the server
    socket.on('newPost', (post) => {
        addPostToDOM(post);
    });

    // Listen for new comment events from the server
    socket.on('newComment', ({ postId, comment }) => {
        const postElement = document.querySelector(`[data-post-id="${postId}"]`);
        if (postElement) {
            const commentsList = postElement.querySelector('.comments-list');
            const commentItem = document.createElement('div');
            commentItem.classList.add('comment-item');
            commentItem.innerHTML = `<strong>${comment.username}:</strong> ${comment.content}`;
            commentsList.appendChild(commentItem);
        }
    });

    // Listen for new reaction events from the server
    socket.on('newReaction', ({ postId, reaction }) => {
        const postElement = document.querySelector(`[data-post-id="${postId}"]`);
        if (postElement) {
            const reactionButton = postElement.querySelector(`.reaction-button[data-emoji="${reaction.emoji}"]`);
            if (reactionButton) {
                const countSpan = reactionButton.querySelector('.reaction-count');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            }
        }
    });

    // --- Chat Logic ---
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('m');
    const sendMessageBtn = document.getElementById('send-message');

    // Function to add a message to the chat window
    const addMessage = (msg) => {
        const item = document.createElement('div');
        item.classList.add('message-container');
        if (msg.username === currentNickname) {
            item.classList.add('my-message');
        }
        item.innerHTML = `
            <div class="username-display"><strong>${msg.username}</strong></div>
            <div class="message-bubble">
                <div class="message-content">
                    ${msg.content}
                </div>
                <small class="message-timestamp grey-text text-lighten-1">${new Date(msg.timestamp).toLocaleString()}</small>
            </div>
        `;
        messagesDiv.appendChild(item);
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
    };

    // Handle sending chat messages
    sendMessageBtn.addEventListener('click', () => {
        const content = messageInput.value;
        if (!currentNickname) {
            M.toast({ html: '닉네임을 먼저 설정해주세요.', classes: 'red darken-2' });
            nicknameModal.open();
            return;
        }
        if (content) {
            socket.emit('chatMessage', { username: currentNickname, content });
            messageInput.value = '';
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessageBtn.click();
        }
    });

    // Listen for chat messages from the server
    socket.on('chatMessage', (msg) => {
        addMessage(msg);
    });

    // Listen for chat history from the server
    socket.on('history', (messages) => {
        messages.forEach(msg => addMessage(msg));
    });
});

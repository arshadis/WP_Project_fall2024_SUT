// Import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Middleware
app.use(bodyParser.json());

// Mock database (for demonstration purposes)
const db = {
    users: [],
    questions: [],
    categories: [],
    scores: []
};

// Helper functions (e.g., token validation, mock authentication)
const validateToken = (bearerToken) => {
    const token = bearerToken && bearerToken.startsWith('Bearer ') ? bearerToken.split(" ").slice(-1)[0] : null;
    return db.users.find(user => user.token === token);
};
const generateToken = () => Math.random().toString(36).substr(2);

// Routes

// Signup
app.post('/signup', (req, res) => {
    const { firstname, lastname, email, password, type } = req.body;

    if (!firstname) return res.json({ success: false, error: { type: 1, message: "نام نمی تواند خالی باشد" } });
    if (!lastname) return res.json({ success: false, error: { type: 2, message: "نام خانوادگی نمی تواند خالی باشد" } });
    if (!password) return res.json({ success: false, error: { type: 3, message: "رمز نمی تواند خالی باشد" } });
    if (!type) return res.json({ success: false, error: { type: 4, message: "نوع ورود نمی تواند خالی باشد" } });
    if (!email) return res.json({ success: false, error: { type: 5, message: "ایمیل ورود نمی تواند خالی باشد" } });

    const existingUser = db.users.find(user => user.email === email);
    if (existingUser) return res.json({ success: false, error: { type: 10, message: "کاربر از قبل وجود دارد. لاگین کنید" } });

    const token = generateToken();
    db.users.push({ firstname, lastname, email, password, type, token });

    res.json({ success: true });
});

// Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email && u.password === password);

    if (!user) return res.json({ success: false, error: { message: "ایمیل یا رمز عبور اشتباه است" } });

    res.json({ success: true, data: { token: user.token, type: user.type } });
});

// Score
app.post('/score-player', (req, res) => {
    const user = validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    res.json({
        success: true,
        data: {
            table: db.scores
        }
    });
});

// Answered Question
app.post('/answered_question', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    res.json({
        success: true,
        data: {
            table: {
                question: db.questions.map(q => ({
                    id: q.id,
                    question: q.question,
                    designer: q.designer,
                    correct: q.correct
                }))
            }
        }
    });
});

// Get Not Answered Question
app.post('/get_not_answered_question', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const question = db.questions.find(q => !q.answeredBy.includes(user.id));

    res.json({
        success: true,
        data: {
            question
        }
    });
});

// Check Question Answer
app.post('/check_question_answer', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { question_id, option } = req.body;
    const question = db.questions.find(q => q.id === question_id);

    if (!question) return res.json({ success: false, error: { message: "سوال پیدا نشد" } });

    const correct = question.correct === option;

    res.json({ success: true, data: { correct } });
});

// Designer View
app.post('/designer_view', (req, res) => {
    const { designerId } = req.body;
    const designer = db.users.find(u => u.id === designerId && u.type === 'designer');

    if (!designer) return res.json({ success: false, error: { message: "طراح پیدا نشد" } });

    const designedQuestions = db.questions.filter(q => q.designer.id === designerId);

    res.json({
        success: true,
        data: {
            designer: {
                firstname: designer.firstname,
                lastname: designer.lastname,
                email: designer.email,
                designedCount: designedQuestions.length,
                correctAnsweredCount: designedQuestions.filter(q => q.correctCount).length,
                notCorrectAnsweredCount: designedQuestions.filter(q => q.notCorrectCount).length
            }
        }
    });
});

// Player View
app.post('/player_view', (req, res) => {
    const { playerId } = req.body;
    const player = db.users.find(u => u.id === playerId && u.type === 'player');

    if (!player) return res.json({ success: false, error: { message: "بازیکن پیدا نشد" } });

    res.json({
        success: true,
        data: {
            player: {
                firstname: player.firstname,
                lastname: player.lastname,
                email: player.email,
                playerScore: player.score,
                correctAnswerCount: player.correctAnswers,
                notCorrectAnswerCount: player.notCorrectAnswers
            }
        }
    });
});

// Get Designed Questions
app.post('/get_designed_question', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const designedQuestions = db.questions.map(q => ({
        id: q.id,
        question: q.question,
        correctCount: q.correctCount || 0,
        notCorrectCount: q.notCorrectCount || 0
    }));

    res.json({
        success: true,
        data: {
            table: { question: designedQuestions }
        }
    });
});

// Set Similar Questions
app.post('/set_similar_question', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { questionId, similars } = req.body;
    const question = db.questions.find(q => q.id === questionId);

    if (!question) return res.json({ success: false, error: { message: "سوال پیدا نشد" } });

    question.similarQuestions = similars;

    res.json({ success: true });
});

// New Designed Question
app.post('/new_designed_question', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { question, options, correct, level, category } = req.body;

    const newQuestion = {
        id: db.questions.length + 1,
        question,
        options,
        correct,
        level,
        category,
        designer: user,
        correctCount: 0,
        notCorrectCount: 0,
        similarQuestions: []
    };

    db.questions.push(newQuestion);

    res.json({ success: true });
});

// Get Categories
app.post('/get_categories', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const categories = db.categories.map(cat => ({
        id: cat.id,
        category: cat.name,
        question_count: db.questions.filter(q => q.category === cat.name).length
    }));

    res.json({
        success: true,
        data: {
            table: categories
        }
    });
});

// New Category
app.post('/new_category', (req, res) => {
    const user = validateToken(req.headers.authorization);

    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { category } = req.body;

    db.categories.push({ id: db.categories.length + 1, name: category });

    res.json({ success: true });
});

// Validate Token
app.post('/validate_token', (req, res) => {
    const user = validateToken(req.headers.authorization);

    res.json({
        success: true,
        data: { valid: !!user }
    });
});

// Start server
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

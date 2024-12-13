const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const app = express();

app.use(bodyParser.json());

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const pool = mysql.createPool({
    host: 'localhost',
    user: 'fazel',
    password: '',
    database: 'quiz_db'
});

const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
};

const validateToken = async (bearerToken) => {
    const token = bearerToken && bearerToken.startsWith('Bearer ') ? bearerToken.split(" ").slice(-1)[0] : null;
    return await query("SELECT * FROM users WHERE token = ?", [token]).then(results => results[0]);
};
const generateToken = () => Math.random().toString(36).substr(2);


const validateNotEmpty = (field, fieldName) => {
    if (!field || String(field).trim() === '') {
        return { success: false, error: { message: `${fieldName} نمی تواند خالی باشد` } };
    }
    return { success: true };
};

const validateRange = (field, min, max, fieldName) => {
    if (field < min || field > max) {
        return { success: false, error: { message: `${fieldName} باید بین ${min} و ${max} باشد` } };
    }
    return { success: true };
};

const validateUnique = (field, dbField, fieldName, fieldNameError = fieldName) => {
    return query(`SELECT * FROM ${dbField} WHERE ${fieldName} = ?`, [field]).then(results => {
        if (results.length > 0) {
            return { success: false, error: { message: `${fieldNameError} تکراری است` } };
        }
        return { success: true };
    });
};


app.post('/signup', async (req, res) => {
    const { firstname, lastname, email, password, type } = req.body;

    let validationResult = validateNotEmpty(firstname, 'نام');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(lastname, 'نام خانوادگی');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(password, 'رمزعبور');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(type, 'نوع بازیکن');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(email, 'ایمیل');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = await validateUnique(email, 'users', 'email', 'ایمیل');
    if (!validationResult.success) return res.json(validationResult);

    const token = generateToken();
    await query("INSERT INTO users (firstname, lastname, email, password, type, token, score) VALUES (?, ?, ?, ?, ?, ?, 0)", [firstname, lastname, email, password, type, token]);

    res.json({ success: true });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const results = await query("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);

    if (results.length === 0) return res.json({ success: false, error: { message: "ایمیل یا رمز عبور اشتباه است" } });

    res.json({ success: true, data: { token: results[0].token, type: results[0].type } });
});

app.post('/follow', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 1) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { user_id } = req.body;

    let validation = validateNotEmpty(user_id, 'شناسه کاربر');
    if (!validation.success) return res.json(validation);

    if (user.id === user_id) {
        return res.json({ success: false, error: { message: "شما نمی توانید خودتان را دنبال کنید" } });
    }

    const alreadyFollowing = await query("SELECT * FROM followers WHERE follower_id = ? AND followed_id = ?", [user.id, user_id]);

    if (alreadyFollowing.length > 0) {
        return res.json({ success: false, error: { message: "شما قبلاً این کاربر را دنبال کرده‌اید" } });
    }

    await query("INSERT INTO followers (follower_id, followed_id) VALUES (?, ?)", [user.id, user_id]);

    res.json({ success: true });
});

app.post('/unfollow', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { user_id } = req.body;

    let validation = validateNotEmpty(user_id, 'شناسه کاربر');
    if (!validation.success) return res.json(validation);

    if (user.id === user_id) {
        return res.json({ success: false, error: { message: "شما نمی توانید خودتان را از دنبال کردن حذف کنید" } });
    }

    const following = await query("SELECT * FROM followers WHERE follower_id = ? AND followed_id = ?", [user.id, user_id]);

    if (following.length === 0) {
        return res.json({ success: false, error: { message: "شما این کاربر را دنبال نکرده‌اید" } });
    }

    await query("DELETE FROM followers WHERE follower_id = ? AND followed_id = ?", [user.id, user_id]);

    res.json({ success: true });
});

app.post('/score_player', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 1) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const users = await query("SELECT * FROM users WHERE type = 1 ORDER BY score DESC");


    res.json({
        success: true,
        data: {
            table: users.map(user => ({
                id: user.id,
                name: `${user.firstname} ${user.lastname}`,
                score: user.score
            }))
        }
    });
});

app.post('/answered_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 1) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const answered_questions = await query("SELECT * FROM answered_questions JOIN questions on answered_questions.question_id = questions.id JOIN users on questions.designer_id = users.id WHERE user_id = ? ORDER BY answered_questions.id DESC", [user.id]);

    res.json({
        success: true,
        data: {
            table: answered_questions.map(answered_question => ({
                id: answered_question.question_id,
                question: answered_question.question,
                correct: answered_question.correct,
                designer: {
                    id: answered_question.designer_id,
                    name: answered_question.firstname + " " + answered_question.lastname
                }
            }))
        }
    });
});

app.post('/get_not_answered_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 1) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { type, id } = req.body;

    let validationResult = validateNotEmpty(type, 'نوع سوال');
    if (!validationResult.success) return res.json(validationResult);

    if (type !== 'random' && type !== 'category') {
        return res.json({ success: false, error: { message: "نوع سوال نامعتبر است" } });
    }

    if (type === 'category') {
        validationResult = validateNotEmpty(id, 'شناسه دسته‌بندی');
        if (!validationResult.success) return res.json(validationResult);
    }

    let queryStr;
    let queryParams;

    if (type === 'random') {
        queryStr = `
            SELECT q.* 
            FROM questions q
            LEFT JOIN answered_questions aq ON q.id = aq.question_id AND aq.user_id = ?
            WHERE aq.question_id IS NULL
            ORDER BY RAND()
            LIMIT 1
        `;
        queryParams = [user.id];
    } else if (type === 'category') {
        queryStr = `
            SELECT q.* 
            FROM questions q
            LEFT JOIN answered_questions aq ON q.id = aq.question_id AND aq.user_id = ?
            WHERE aq.question_id IS NULL AND q.category = ?
            ORDER BY RAND()
            LIMIT 1
        `;
        queryParams = [user.id, id];
    }

    const questions = await query(queryStr, queryParams);

    if (questions.length === 0) {
        return res.json({ success: false, error: { message: "سوالی یافت نشد" } });
    }

    const question = questions[0];

    const options = await query(`SELECT * FROM options WHERE question_id = ?`, [question.id]);

    res.json({
        success: true,
        data: {
            id: question.id,
            question: question.question,
            options: options.map(option => (option.option)),
        }
    });
});

app.post('/check_question_answer', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 1) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { question_id, option } = req.body;

    let validationResult = validateNotEmpty(question_id, 'شناسه سوال');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateRange(option, 1, 4, 'پاسخ صحیح');
    if (!validationResult.success) return res.json(validationResult);

    const question = await query("SELECT correct_option FROM questions WHERE id = ?", [question_id]);

    if (question.length === 0) {
        return res.json({ success: false, error: { message: "سوال مورد نظر یافت نشد" } });
    }

    const alreadyAnswered = await query("SELECT * FROM answered_questions WHERE user_id = ? AND question_id = ?", [user.id, question_id]);

    if (alreadyAnswered.length > 0) {
        return res.json({ success: false, error: { message: "شما قبلاً به این سوال پاسخ داده‌اید" } });
    }

    const correct = question[0].correct_option;

    const scoreChange = (correct === option) ? 1 : -1;

    await query("INSERT INTO answered_questions (user_id, question_id, correct) VALUES (?, ?, ?)", [user.id, question_id, correct === option]);
    await query("UPDATE users SET score = score + ? WHERE id = ?", [scoreChange, user.id]);

    res.json({
        success: true,
        data: {
            correct: correct === option
        }
    });
});
app.post('/designer_view', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { designer_id } = req.body;

    let validationResult = validateNotEmpty(designer_id, 'شناسه طراح');
    if (!validationResult.success) return res.json(validationResult);

    const designer = await query("SELECT firstname, lastname, email FROM users WHERE id = ? and type = 2", [designer_id]);

    if (designer.length === 0) {
        return res.json({ success: false, error: { message: "طراح یافت نشد" } });
    }

    const designedQuestions = await query(
        `SELECT 
            q.id, 
            (SELECT COUNT(*) FROM answered_questions WHERE question_id = q.id AND correct = 1) AS correctCount,
            (SELECT COUNT(*) FROM answered_questions WHERE question_id = q.id AND correct = 0) AS notCorrectCount
        FROM questions q 
        WHERE q.designer_id = ?`,
        [designer_id]
    );

    const isFollowing = await query("SELECT * FROM followers WHERE follower_id = ? AND followed_id = ?", [user.id, designer_id]);

    res.json({
        success: true,
        data: {
            firstname: designer[0].firstname,
            lastname: designer[0].lastname,
            email: designer[0].email,
            designedCount: designedQuestions.length,
            correctAnsweredCount: designedQuestions.reduce((sum, q) => sum + q.correctCount, 0),
            notCorrectAnsweredCount: designedQuestions.reduce((sum, q) => sum + q.notCorrectCount, 0),
            isFollowing: isFollowing.length > 0
        }
    });
});

app.post('/player_view', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const { player_id } = req.body;

    let validationResult = validateNotEmpty(player_id, 'شناسه بازیکن');
    if (!validationResult.success) return res.json(validationResult);

    const player = await query("SELECT firstname, lastname, email, score FROM users WHERE id = ? and type = 1", [player_id]);

    if (player.length === 0) {
        return res.json({ success: false, error: { message: "بازیکن یافت نشد" } });
    }

    const answers = await query(
        `SELECT 
            SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correctAnswers,
            SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS notCorrectAnswers
        FROM answered_questions 
        WHERE user_id = ?`,
        [player_id]
    );

    const isFollowing = await query("SELECT * FROM followers WHERE follower_id = ? AND followed_id = ?", [user.id, player_id]);

    res.json({
        success: true,
        data: {
            firstname: player[0].firstname,
            lastname: player[0].lastname,
            email: player[0].email,
            playerScore: player[0].score,
            correctAnswerCount: answers[0].correctAnswers || 0,
            notCorrectAnswerCount: answers[0].notCorrectAnswers || 0,
            isFollowing: isFollowing.length > 0
        }
    });
});

app.post('/get_designed_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const designedQuestions = await query(
        `SELECT 
            q.id, 
            q.question,
            (SELECT COUNT(*) FROM answered_questions WHERE question_id = q.id AND correct = 1) AS correctCount,
            (SELECT COUNT(*) FROM answered_questions WHERE question_id = q.id AND correct = 0) AS notCorrectCount
        FROM questions q 
        WHERE q.designer_id = ?`,
        [user.id]
    );

    res.json({
        success: true,
        data: {
            table: designedQuestions.map(question => ({
                id: question.id,
                question: question.question,
                correctCount: question.correctCount,
                notCorrectCount: question.notCorrectCount
            }))
        }
    });
});

app.post('/get_all_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const designedQuestions = await query(`SELECT q.id, q.question FROM questions q`);

    res.json({
        success: true,
        data: {
            table: designedQuestions.map(question => ({
                id: question.id,
                question: question.question,
            }))
        }
    });
});

app.post('/set_similar_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { question_id, similar_question_ids } = req.body;

    let validation = validateNotEmpty(question_id, 'شناسه سوال');
    if (!validation.success) return res.json(validation);

    if (!Array.isArray(similar_question_ids) || similar_question_ids.length === 0) {
        return res.json({
            success: false,
            error: { message: "لیست سوالات مشابه باید شامل حداقل یک سوال باشد" }
        });
    }

    const questionExists = await query("SELECT * FROM questions WHERE id = ?", [question_id]);
    if (questionExists.length === 0) {
        return res.json({
            success: false,
            error: { message: "سوال اصلی یافت نشد" }
        });
    }

    if (similar_question_ids.includes(question_id)) {
        return res.json({
            success: false,
            error: { message: "سوال اصلی نمی تواند در سوالات مشابه باشد" }
        });
    }

    const similarQuestionsExist = await query("SELECT * FROM questions WHERE id IN (?)", [similar_question_ids]);
    if (similarQuestionsExist.length !== similar_question_ids.length) {
        return res.json({
            success: false,
            error: { message: "یک یا چند سوال مشابه یافت نشد" }
        });
    }

    const existingSimilarQuestions = await query(
        `SELECT * FROM similar_questions WHERE question_id = ? AND similar_question_id IN (?)`,
        [question_id, similar_question_ids]
    );

    const existingSimilarQuestionIds = existingSimilarQuestions.map(row => row.similar_question_id);
    const newSimilarQuestionIds = similar_question_ids.filter(id => !existingSimilarQuestionIds.includes(id));

    if (newSimilarQuestionIds.length > 0) {
        const values = newSimilarQuestionIds.map(similar_question_id => [question_id, similar_question_id]);
    
        await query(
            `INSERT INTO similar_questions (question_id, similar_question_id) VALUES ?`,
            [values]
        );
    }

    res.json({
        success: true,
    });
});

app.post('/get_similar_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { question_id } = req.body;

    let validation = validateNotEmpty(question_id, 'شناسه سوال');
    if (!validation.success) return res.json(validation);

    const questionExists = await query("SELECT * FROM questions WHERE id = ?", [question_id]);
    if (questionExists.length === 0) {
        return res.json({
            success: false,
            error: { message: "سوال یافت نشد" }
        });
    }

    const similarQuestions = await query(
        `SELECT q.id FROM questions q JOIN similar_questions sq ON q.id = sq.similar_question_id WHERE sq.question_id = ?`,
        [question_id]
    );

    res.json({
        success: true,
        data: {
            table: similarQuestions.map(similarQuestion => ( similarQuestion.id ))
        }
    });
});

app.post('/new_designed_question', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { question, firstOption, secondOption, thirdOption, fourthOption, correct, level, category } = req.body;

    let validationResult = validateNotEmpty(question, 'سوال');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(firstOption, 'گزینه ۱');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(secondOption, 'گزینه ۲');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(thirdOption, 'گزینه ۳');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(fourthOption, 'گزینه ۴');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateRange(correct, 1, 4, 'پاسخ صحیح');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(level, 'سطح');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateNotEmpty(category, 'دسته‌بندی');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = validateRange(level, 1, 5, 'سطح');
    if (!validationResult.success) return res.json(validationResult);

    const categoryExists = await query("SELECT * FROM categories WHERE id = ?", [category]);
    if (categoryExists.length === 0) {
        return res.json({
            success: false,
            error: { message: "دسته‌بندی یافت نشد" }
        });
    }

    const result = await query("INSERT INTO questions (question, level, category, designer_id, correct_option) VALUES (?, ?, ?, ?, 0)", [question, level, category, user.id]);
    const questionId = result.insertId;

    const options = [firstOption, secondOption, thirdOption, fourthOption];
    const values = options.map(option => [questionId, option]);

    await query(
        `INSERT INTO options (question_id, \`option\`) VALUES ?`,
        [values]
    );

    await query("UPDATE questions SET correct_option = ? WHERE id = ?", [correct, questionId]);

    res.json({ success: true });
});


app.post('/get_categories', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    const categories = await query("SELECT * FROM categories");

    res.json({
        success: true,
        data: {
            table: categories
        }
    });
});

app.post('/new_category', async (req, res) => {
    const user = await validateToken(req.headers.authorization);
    if (!user) return res.json({ success: false, error: { message: "توکن نامعتبر است" } });

    if (user.type != 2) {
        return res.json({ success: false, error: { message: "شما دسترسی ندارید" } });
    }

    const { category } = req.body;

    let validationResult = validateNotEmpty(category, 'دسته‌بندی');
    if (!validationResult.success) return res.json(validationResult);

    validationResult = await validateUnique(category, 'categories', 'name', 'دسته‌بندی');
    if (!validationResult.success) return res.json(validationResult);

    await query("INSERT INTO categories (name) VALUES (?)", [category]);

    res.json({ success: true });
});

app.post('/validate_token', async (req, res) => {
    const user = await validateToken(req.headers.authorization);

    res.json({
        success: true,
        data: {
            valid: !!user,
            type: user ? user.type : 0
        }
    });
});

const PORT = 8001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

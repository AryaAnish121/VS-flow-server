require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const convertType = require('./converterType');

mongoose.connect(process.env.MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = mongoose.Schema({
  name: String,
  profileUrl: String,
  githubId: Number,
});

const questionSchema = mongoose.Schema({
  title: String,
  body: String,
  creatorId: Number,
  creatorName: String,
  timestamp: Number,
  answers: Array,
});

const User = mongoose.model('user', userSchema);
const Question = mongoose.model('question', questionSchema);

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(passport.initialize());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT,
      clientSecret: process.env.GITHUB_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK,
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOne({ githubId: profile.id }, (err, result) => {
        if (err) {
          console.log(err);
        } else {
          if (!result) {
            const user = new User({
              name: profile.displayName,
              profileUrl: profile.profileUrl,
              githubId: profile.id,
            });
            user.save((err) => {
              if (err) {
                console.log(err);
              } else {
                cb(null, {
                  accessToken: jwt.sign(
                    { githubId: profile.id },
                    process.env.JWT_SECRET,
                    { expiresIn: '1y' }
                  ),
                });
              }
            });
          } else {
            cb(null, {
              accessToken: jwt.sign(
                { githubId: profile.id },
                process.env.JWT_SECRET,
                { expiresIn: '1y' }
              ),
            });
          }
        }
      });
    }
  )
);

const isAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send({ user: null });
  } else {
    const token = authHeader.split(' ')[1];
    if (!convertType(token)) {
      res.status(401).send({ user: null });
    } else {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (!payload.githubId) {
          res.status(401).send({ user: null });
        } else {
          User.findOne({ githubId: payload.githubId }, (err, result) => {
            if (err) {
              console.log(err);
            } else {
              if (!result) {
                res.status(401).send({ user: null });
              } else {
                req.user = result;
                next();
              }
            }
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
  }
};

app.get('/auth/github', passport.authenticate('github', { session: false }));

app.get(
  '/auth/github/callback',
  passport.authenticate('github', { session: false }),
  function (req, res) {
    res.redirect(`http://localhost:54321/auth/${req.user.accessToken}`);
  }
);

app.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send({ user: null });
  } else {
    const token = authHeader.split(' ')[1];
    console.log(typeof token, token);

    if (!convertType(token)) {
      res.status(401).send({ user: null });
    } else {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (!payload.githubId) {
          res.status(401).send({ user: null });
        } else {
          User.findOne({ githubId: payload.githubId }, (err, result) => {
            if (err) {
              console.log(err);
            } else {
              if (!result) {
                res.status(401).send({ user: null });
              } else {
                res.status(200).send(result);
              }
            }
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
  }
});

app.get('/my-questions', isAuth, (req, res) => {
  Question.find({ creatorId: req.user.githubId }, (err, result) => {
    if (err) {
      console.log(err);
    } else {
      res.send(result);
    }
  }).sort({
    timestamp: -1,
  });
});

app.get('/getQuestions', isAuth, (req, res) => {
  Question.find({}, (err, result) => {
    if (err) {
      console.log(err);
    } else {
      res.status(200).send(result);
    }
  }).sort({
    timestamp: -1,
  });
});

app.post('/search', isAuth, (req, res) => {
  Question.find(
    {
      title: { $regex: '.*' + req.body.query + '.*', $options: 'i' },
    },
    (err, result) => {
      if (err) {
        console.log(err);
      } else {
        res.status(200).send(result);
      }
    }
  ).sort({
    timestamp: -1,
  });
});

app.post('/question', isAuth, (req, res) => {
  Question.findById(req.body.id, (err, result) => {
    if (err) {
      console.log(err);
    } else {
      if (!result) {
        res
          .status(206)
          .send({ status: 'failue', message: 'No question found' });
      } else {
        res.status(200).send(result);
      }
    }
  });
});

app.post('/answer-question', isAuth, (req, res) => {
  if (!req.body.id) {
    res.status(206).send({
      status: 'success',
      message: 'Please provide an id',
    });
  } else {
    if (!req.body.value) {
      res.status(206).send({
        status: 'success',
        message: 'Please provide a value',
      });
    } else {
      if (req.body.value.length > 500 || req.body.value.length < 50) {
        res.status(206).send({
          status: 'failure',
          message: 'Title must be between 50 and 500 characters',
        });
      } else {
        Question.findById(req.body.id, (err, result) => {
          if (err) {
            console.log(err);
          } else {
            if (!result) {
              res
                .status(206)
                .send({ status: 'failue', message: 'No question found' });
            } else {
              result.answers.push({
                answerer: req.user.name,
                value: req.body.value,
              });
              result.save((err) => {
                if (err) {
                  console.log(err);
                } else {
                  res.status(200).send({ name: req.user.name });
                }
              });
            }
          }
        });
      }
    }
  }
});

app.post('/new-question', isAuth, (req, res) => {
  if (!req.body.title || !req.body.body) {
    res
      .status(206)
      .send({ status: 'failure', message: 'Please fill all the information' });
  } else {
    if (req.body.title.length > 35 || req.body.title.length < 10) {
      res.status(206).send({
        status: 'failure',
        message: "Title's length must be between 10 and 35 characters",
      });
    } else if (req.body.body.length > 500 || req.body.body.length < 50) {
      res.status(206).send({
        status: 'failure',
        message: "Body's length must be between 50 and 500 characters",
      });
    } else {
      const question = new Question({
        title: req.body.title,
        body: req.body.body,
        creatorId: req.user.githubId,
        creatorName: req.user.name,
        timestamp: new Date().getTime(),
        answers: [],
      });
      question.save((err) => {
        if (err) {
          console.log(err);
        } else {
          res.status(200).send({ status: 'success', question });
        }
      });
    }
  }
});

app.listen(process.env.PORT || 3000);

// const jwt = require('jsonwebtoken');

// const authenticateToken = (req, res, next) => {
//   // Полчуить токен из заголовка Authorization
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   // Проверям, есть ли токен
//   if (!token) {
//     req.user = null;
//     // return res.status(403).json({ error: 'Unauthorized' });
//     next();
//   }

//   try {
//     console.log("accen", token);
//     // Проверяем токен
//     jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
//       if (err) {
//         return res.status(401).json({ error: 'Invalid token' });
//       }
//       // console.log(user);
//       req.user = user;
      
//       next();
//     });
//   }catch (error){
//     console.error('Ошибка аутентификации:', error);

//     if (error instanceof jwt.TokenExpiredError) {
//       return res.status(401).json({ error: 'Токен доступа истек' });
//     }

//     if (error instanceof jwt.JsonWebTokenError) {
//       return res.status(403).json({ error: 'Невалидный токен' });
//     }

//     res.status(500).json({ error: 'Ошибка аутентификации' });
//   }
// };

// module.exports = { authenticateToken };

const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Токена нет — помечаем пользователя как null и идём дальше
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: 'Токен доступа истек' });
      }
      if (err instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ error: 'Невалидный токен' });
      }
      // Любая другая ошибка — 500
      console.error('Ошибка аутентификации:', err);
      return res.status(500).json({ error: 'Ошибка аутентификации' });
    }

    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };



// const jwt = require('jsonwebtoken');

// const authenticateTokenOptional = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) {
//     // Токена нет — гость, пропускаем без ошибки
//     return next();
//   }

//   jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
//     if (err) {
//       // Токен есть, но невалидный — возвращаем 401, чтобы клиент обновил токен
//       return res.status(401).json({ error: 'Invalid or expired token' });
//     }

//     req.user = user;
//     next();
//   });
// };

// module.exports = { authenticateTokenOptional };


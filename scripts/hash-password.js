/**
 * Make a value for ADMIN_PASSWORD_HASH.
 *   npm run hash-password -- "your strong password"
 */
const { hashPassword } = require('../src/middleware/auth');

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run hash-password -- "a password of at least 10 characters"');
  process.exit(1);
}
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);

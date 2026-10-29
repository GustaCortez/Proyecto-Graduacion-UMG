/**
 * Entorno de pruebas. Se ejecuta antes de cada archivo de prueba.
 * Las pruebas NO dependen del .env real: dotenv no sobrescribe variables ya
 * definidas, asi que lo que se fija aqui prevalece sobre backend/.env.
 */
process.env.NODE_ENV = 'test';
// 64 caracteres hexadecimales: cumple el minimo de 32 que exige server.js.
process.env.JWT_SECRET = 'a3f1c9e7b5d2480f6e1a7c3b9d5f2e8a4c6b1d7f9e3a5c8b2d4f6a8c0e2b4d6f';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_DAYS = '7';
process.env.TRUST_PROXY = '0';
// dotenv 17 imprime un aviso por cada archivo que carga; en pruebas solo es ruido.
process.env.DOTENV_CONFIG_QUIET = 'true';

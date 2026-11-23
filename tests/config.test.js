// Loads a fresh copy of src/config with the given environment variables, restoring process.env afterwards.
function loadConfig(vars) {
  const saved = { ...process.env };
  ['NODE_ENV', 'SESSION_SECRET', 'JWT_SECRET', 'COOKIE_SECURE'].forEach((k) => delete process.env[k]);
  Object.assign(process.env, vars);
  try {
    let config;
    jest.isolateModules(() => {
      config = require('../src/config');
    });
    return config;
  } finally {
    process.env = saved;
  }
}

describe('config hardening', () => {
  test('production refuses to start without SESSION_SECRET / JWT_SECRET', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'j' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's' })).toThrow(/JWT_SECRET/);
  });

  test('production uses the provided secrets and secure cookies by default', () => {
    const config = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's', JWT_SECRET: 'j' });
    expect(config.sessionSecret).toBe('s');
    expect(config.jwtSecret).toBe('j');
    expect(config.cookieSecure).toBe(true);
  });

  test('COOKIE_SECURE=false overrides the production default (plain-HTTP demo)', () => {
    const config = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's', JWT_SECRET: 'j', COOKIE_SECURE: 'false' });
    expect(config.cookieSecure).toBe(false);
  });

  test('development keeps the dev fallbacks and non-secure cookies', () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    expect(config.sessionSecret).toBe('lablend-dev-session-secret');
    expect(config.jwtSecret).toBe('lablend-dev-jwt-secret');
    expect(config.cookieSecure).toBe(false);
  });
});

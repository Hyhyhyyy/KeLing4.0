require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const { prisma: db } = require('../src/database');

test('ten course appearances persist across clients without changing study data or bypassing ownership', async () => {
  const owner = randomUUID(), other = randomUUID();
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'keling-server', audience: 'keling-clients' });
  const request = (path, body, method = 'GET', user = owner) => fetch(base + path, {
    method, headers: { Authorization: 'Bearer ' + token(user), 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  try {
    for (const id of [owner, other]) await db.user.create({ data: { id, email: id + '@test.local', passwordHash: 'test' } });
    let course;
    for (let planetStyleIndex = 0; planetStyleIndex < 10; planetStyleIndex++) {
      const response = await request('/courses', { name: '同一学科 ' + planetStyleIndex, planetStyleIndex }, 'POST');
      assert.equal(response.status, 201);
      course = (await response.json()).course;
      assert.equal(course.planetStyleIndex, planetStyleIndex);
      assert.equal((await (await request('/courses/' + course.id)).json()).course.planetStyleIndex, planetStyleIndex);
    }
    const listed = (await (await request('/courses')).json()).courses;
    assert.deepEqual(listed.map(item => item.planetStyleIndex).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const defaultResponse = await request('/courses', { name: '默认外观' }, 'POST');
    assert.equal(defaultResponse.status, 201);
    assert.equal((await defaultResponse.json()).course.planetStyleIndex, 0);

    await db.course.update({ where: { id: course.id }, data: { masteryLevel: 0.6, totalStudyMinutes: 75, studySessionCount: 3, teacher: '原教师', location: 'A101' } });
    const node = await db.knowledgeNode.create({ data: { id: randomUUID(), courseId: course.id, name: '保留的知识点' } });
    const before = await db.course.findUnique({ where: { id: course.id } });
    const profileBefore = await db.user.findUnique({ where: { id: owner } });
    const changed = await request('/courses/' + course.id, { planetStyleIndex: 0 }, 'PUT');
    assert.equal(changed.status, 200);
    const after = (await changed.json()).course;
    for (const key of ['name', 'code', 'teacher', 'location', 'themeColor', 'masteryLevel', 'totalStudyMinutes', 'studySessionCount', 'plantStage']) assert.equal(after[key], before[key], key);
    assert.equal(after.planetStyleIndex, 0);
    assert.deepEqual(await db.user.findUnique({ where: { id: owner } }), profileBefore);
    assert.equal((await db.knowledgeNode.findUnique({ where: { id: node.id } })).name, node.name);
    assert.equal((await request('/courses/' + course.id, { planetStyleIndex: 9 }, 'PUT')).status, 200);

    for (const planetStyleIndex of [-1, 10, 1.5, '9', null, true]) {
      assert.equal((await request('/courses', { name: '无效外观', planetStyleIndex }, 'POST')).status, 400);
      assert.equal((await request('/courses/' + course.id, { name: '不应改名', planetStyleIndex }, 'PUT')).status, 400);
    }
    const unchanged = (await (await request('/courses/' + course.id)).json()).course;
    assert.equal(unchanged.name, before.name);
    assert.equal(unchanged.planetStyleIndex, 9);
    assert.equal((await request('/courses/' + course.id, { planetStyleIndex: 1 }, 'PUT', other)).status, 404);
    assert.equal((await (await request('/courses/' + course.id)).json()).course.planetStyleIndex, 9);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.$disconnect();
  }
});

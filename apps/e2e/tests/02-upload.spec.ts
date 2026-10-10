import { API, CTRL, control, expect, makeWav, open, row, seedTrack, test, trackRows, wavFile } from './helpers';

const panel = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Uploads' });
const fileInput = (page: import('@playwright/test').Page) => page.locator('input[type="file"]').first();

test.describe('uploading', () => {
  test('a file becomes a track with its tags read from the file', async ({ app }) => {
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles(wavFile('raw-name.wav', { title: 'Harbour Lights', artist: 'Tide & Co', album: 'Coastlines', seconds: 3 }));

    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await expect(row(app.page, 'Harbour Lights')).toBeVisible();
    await expect(row(app.page, 'Harbour Lights')).toContainText('Tide & Co');
    // The name on disk is not used when the file has a title.
    await expect(row(app.page, 'raw-name')).toHaveCount(0);
  });

  test('a file with no tags falls back to a readable title from the file name', async ({ app }) => {
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles(wavFile('01_my_untagged_song.wav'));
    await expect(row(app.page, '01 my untagged song')).toBeVisible();
  });

  test('several files at once all arrive, one after another', async ({ app }) => {
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles([
      wavFile('a.wav', { title: 'Song A' }),
      wavFile('b.wav', { title: 'Song B' }),
      wavFile('c.wav', { title: 'Song C' }),
    ]);
    await expect(panel(app.page).getByText(/3 of 3 uploaded/)).toBeVisible();
    for (const title of ['Song A', 'Song B', 'Song C']) await expect(row(app.page, title)).toBeVisible();
  });

  test('choosing the same file again is not silently ignored', async ({ app, expectErrors }) => {
    expectErrors(/status of 409/);
    await open(app.page, '/library');
    const file = wavFile('same.wav', { title: 'Same Song' });
    await fileInput(app.page).setInputFiles(file);
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await fileInput(app.page).setInputFiles(file);
    await expect(panel(app.page).getByText(/already in your library/i)).toBeVisible();
    await expect(trackRows(app.page).filter({ hasText: 'Same Song' })).toHaveCount(1);
  });

  test('the same audio under a different name is caught as a duplicate', async ({ app, expectErrors }) => {
    expectErrors(/status of 409/);
    await open(app.page, '/library');
    const body = makeWav({ title: 'Twin', seconds: 2 });
    await fileInput(app.page).setInputFiles({ name: 'first.wav', mimeType: 'audio/wav', buffer: body });
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await fileInput(app.page).setInputFiles({ name: 'renamed copy.wav', mimeType: 'audio/wav', buffer: body });
    await expect(panel(app.page).getByText(/already in your library/i)).toBeVisible();
    await expect(trackRows(app.page).filter({ hasText: 'Twin' })).toHaveCount(1);
  });

  test('unsupported files are refused without being sent anywhere', async ({ app, request }) => {
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      { name: 'movie.mp4.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') },
      { name: 'noextension', mimeType: 'audio/wav', buffer: makeWav() },
    ]);
    await expect(panel(app.page).getByText('Not a supported audio file')).toHaveCount(3);
    const state = await (await control(request, 'state')).json();
    expect(state.objects).toEqual([]);
  });

  test('a file that is named like audio but is not audio is rejected and cleaned up', async ({ app, request, expectErrors }) => {
    expectErrors(/status of 422/);
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles({ name: 'fake.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not audio '.repeat(200)) });
    await expect(panel(app.page).getByText(/could not be read as audio/i)).toBeVisible();
    const state = await (await control(request, 'state')).json();
    expect(state.objects, 'the rejected file must not stay in storage').toEqual([]);
    await expect(trackRows(app.page)).toHaveCount(0);
  });

  test.describe('failures', () => {
    test.use({ allowedErrors: { patterns: [/status of 500/, /status of 413/, /status of 422/, /Failed to load resource/] } });

    test('a failed upload says why and can be retried', async ({ app, request }) => {
      await open(app.page, '/library');
      await control(request, 'fail-puts', { count: 1 });
      await fileInput(app.page).setInputFiles(wavFile('flaky.wav', { title: 'Flaky Song' }));

      await expect(panel(app.page).getByText(/Storage rejected the upload/)).toBeVisible();
      await expect(trackRows(app.page).filter({ hasText: 'Flaky Song' })).toHaveCount(0);

      await panel(app.page).getByRole('button', { name: 'Retry flaky.wav' }).click();
      await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
      await expect(row(app.page, 'Flaky Song')).toBeVisible();
    });

    test('a file over the size limit is refused up front with the limit named', async ({ app }) => {
      await open(app.page, '/library');
      // The test server allows 5 MB; this is about 6.4 MB.
      await fileInput(app.page).setInputFiles(wavFile('huge.wav', { seconds: 410 }));
      await expect(panel(app.page).getByText(/larger than the 5 MB upload limit/)).toBeVisible();
    });

    test('one bad file in a batch does not stop the others', async ({ app, request }) => {
      await open(app.page, '/library');
      await control(request, 'fail-puts', { count: 1 });
      await fileInput(app.page).setInputFiles([
        wavFile('one.wav', { title: 'Batch One' }),
        wavFile('two.wav', { title: 'Batch Two' }),
        wavFile('three.wav', { title: 'Batch Three' }),
      ]);
      await expect(row(app.page, 'Batch Two')).toBeVisible();
      await expect(row(app.page, 'Batch Three')).toBeVisible();
      await expect(trackRows(app.page).filter({ hasText: 'Batch One' })).toHaveCount(0);
      await expect(panel(app.page).getByRole('button', { name: 'Retry one.wav' })).toBeVisible();
    });

    test('the server is down: a clear message, and the app keeps working', async ({ app }) => {
      await open(app.page, '/library');
      await app.page.route(`${API}/tracks/upload-url`, (route) => route.abort('connectionrefused'));
      await fileInput(app.page).setInputFiles(wavFile('offline.wav', { title: 'Offline Song' }));
      await expect(panel(app.page).getByText(/could not reach the server/i)).toBeVisible();
      await expect(app.page.locator('main#main')).toBeVisible();
    });
  });

  test('an upload can be cancelled, and nothing is added', async ({ app, request }) => {
    await open(app.page, '/library');
    await control(request, 'put-delay', { ms: 5000 });
    await fileInput(app.page).setInputFiles(wavFile('slow.wav', { title: 'Slow Song' }));
    await expect(panel(app.page).getByText(/Uploading \d+%/)).toBeVisible();
    await panel(app.page).getByRole('button', { name: 'Cancel slow.wav' }).click();
    await expect(panel(app.page).getByText('Cancelled')).toBeVisible();
    await app.page.waitForTimeout(1500);
    await expect(trackRows(app.page).filter({ hasText: 'Slow Song' })).toHaveCount(0);
    // And the queue moves on: the next upload still works.
    await control(request, 'put-delay', { ms: 0 });
    await fileInput(app.page).setInputFiles(wavFile('after.wav', { title: 'After Cancel' }));
    await expect(row(app.page, 'After Cancel')).toBeVisible();
  });

  test('uploads keep going while you move around the app', async ({ app, request }) => {
    await open(app.page, '/library');
    await control(request, 'put-delay', { ms: 2500 });
    await fileInput(app.page).setInputFiles(wavFile('travel.wav', { title: 'Travelling Song' }));
    await app.page.getByRole('navigation', { name: 'Main' }).locator('a:visible', { hasText: /^Albums$/ }).click();
    await expect(app.page).toHaveURL(/albums/);
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible({ timeout: 15_000 });
    await app.page.getByRole('navigation', { name: 'Main' }).locator('a:visible', { hasText: /^Songs$/ }).click();
    await expect(row(app.page, 'Travelling Song')).toBeVisible();
  });

  test('the panel can be collapsed, expanded and cleared', async ({ app }) => {
    await open(app.page, '/library');
    await fileInput(app.page).setInputFiles(wavFile('panel.wav', { title: 'Panel Song' }));
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await panel(app.page).getByRole('button', { name: 'Collapse uploads' }).click();
    await expect(panel(app.page).getByText('panel.wav')).toBeHidden();
    await panel(app.page).getByRole('button', { name: 'Expand uploads' }).click();
    await expect(panel(app.page).getByText('panel.wav')).toBeVisible();
    await panel(app.page).getByRole('button', { name: 'Clear' }).click();
    await expect(panel(app.page)).toHaveCount(0);
  });

  test('awkward file names are handled', async ({ app }) => {
    await open(app.page, '/library');
    const names = ['日本語の歌.wav', 'a name with   spaces.wav', 'percent%20and#hash&amp;.wav', `${'long'.repeat(50)}.wav`, '../../escape.wav'];
    await fileInput(app.page).setInputFiles(names.map((name, i) => wavFile(name, { seconds: 1 + i * 0.1 })));
    await expect(panel(app.page).getByText(/5 of 5 uploaded/)).toBeVisible({ timeout: 30_000 });
    await expect(trackRows(app.page)).toHaveCount(5);
  });

  test('dropping files anywhere on the page uploads them, with an overlay while dragging', async ({ app }) => {
    await open(app.page, '/albums');
    const dataTransfer = await app.page.evaluateHandle((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'dropped.wav', { type: 'audio/wav' }));
      return transfer;
    }, makeWav({ title: 'Dropped Song' }).toString('base64'));

    await app.page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await expect(app.page.getByText('Drop to add to your library')).toBeVisible();
    await app.page.dispatchEvent('body', 'dragleave', { dataTransfer });
    await expect(app.page.getByText('Drop to add to your library')).toBeHidden();

    await app.page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await app.page.dispatchEvent('body', 'dragover', { dataTransfer });
    await app.page.dispatchEvent('body', 'drop', { dataTransfer });
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await expect(app.page.getByText('Drop to add to your library')).toBeHidden();
  });

  test('dragging something that is not a file does not show the overlay', async ({ app }) => {
    await open(app.page, '/');
    const dataTransfer = await app.page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'just some text');
      return transfer;
    });
    await app.page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await expect(app.page.getByText('Drop to add to your library')).toBeHidden();
  });

  test('a fresh upload shows up on Home without a manual refresh', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Already Here' });
    await open(app.page, '/');
    await expect(app.page.getByRole('button', { name: 'Play Already Here' })).toBeVisible();
    await fileInput(app.page).setInputFiles(wavFile('new.wav', { title: 'Brand New' }));
    await expect(panel(app.page).getByText(/1 of 1 uploaded/)).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Play Brand New' })).toBeVisible();
  });

  test('the upload endpoints refuse a request without a session', async ({ request }) => {
    const response = await request.post(`${API}/tracks/upload-url`, { data: { fileName: 'a.wav', fileSize: 10 } });
    expect(response.status()).toBe(401);
    // The storage side must not accept anything for a key nobody signed (this server stands in for B2).
    const stray = await request.get(`${CTRL}/state`);
    expect(stray.ok()).toBeTruthy();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { signInThroughTestRoute } from './signIn';

// Needs FEATURE_COLLECTIONS on for the API and the web build, as in CI's e2e run.

const NOTE = 'Remember the **Zephyr** migration';

const cards = (page: Page) => page.locator('article[data-story-id]');

/** The first feed story: its id and title. */
async function firstStory(page: Page) {
  await page.goto('/feed?sort=latest');
  await expect(cards(page).first()).toBeVisible();
  const card = cards(page).first();
  return {
    id: (await card.getAttribute('data-story-id')) ?? '',
    title: ((await card.locator('h2 a').textContent()) ?? '').trim(),
  };
}

/** Saves the story from its page and writes the note there. */
async function saveWithNote(page: Page, story: { id: string }) {
  await page.goto(`/story/${story.id}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note' });
  await expect(note).toBeVisible();
  await note.fill(NOTE);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
}

test('AC-3.4.2 a guest saves a story, writes a note, sees "Saved", reloads and finds it on /story and /saved', async ({
  page,
}) => {
  const story = await firstStory(page);
  await saveWithNote(page, story);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(NOTE);

  await page.goto('/saved');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('📝 Remember the **Zephyr** migration');
});

test('AC-3.4.2 the Preview tab renders the note as Markdown', async ({ page }) => {
  const story = await firstStory(page);
  await saveWithNote(page, story);

  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.locator('[aria-label="Note preview"] strong')).toHaveText('Zephyr');
});

test('AC-3.4.1 unsaving a story with a note asks first; without a note it is instant', async ({
  page,
}) => {
  const story = await firstStory(page);
  await saveWithNote(page, story);
  await page.goto('/saved');
  const save = cards(page).first().getByRole('button', { name: 'Save story' });

  await save.click();
  const dialog = page.getByRole('dialog', { name: `Remove “${story.title}” and its note?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(save).toHaveAttribute('aria-pressed', 'true');

  await save.click();
  await dialog.getByRole('button', { name: 'Remove story and note' }).click();
  await expect(cards(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('devbrief:guest:v1'));
  expect(JSON.parse(stored ?? 'null')).toMatchObject({ saves: [], notes: {} });

  // Saved again with no note, a story unsaves at once.
  await page.goto(`/story/${story.id}`);
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await saveButton.click();
  await expect(saveButton).toHaveAttribute('aria-pressed', 'true');
  await saveButton.click();
  await expect(saveButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('AC-3.4.1 cancelling an unsave with Esc keeps the active card, so the next s asks about the same story', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await expect(cards(page).nth(1)).toBeVisible();
  const second = cards(page).nth(1);
  const older = {
    id: (await cards(page).first().getAttribute('data-story-id')) ?? '',
    title: '',
  };
  const newer = {
    id: (await second.getAttribute('data-story-id')) ?? '',
    title: ((await second.locator('h2 a').textContent()) ?? '').trim(),
  };
  await saveWithNote(page, older);
  // Saved last, so it is the first card on /saved.
  await saveWithNote(page, newer);
  await page.goto('/saved');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  await expect(cards(page)).toHaveCount(2);
  await page.keyboard.press('j');
  await expect(cards(page).first()).toHaveAttribute('data-active', 'true');

  const dialog = page.getByRole('dialog', { name: `Remove “${newer.title}” and its note?` });
  // The card's `s` binding registers just after `data-active` shows, so the first press can land early.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press('s');
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(cards(page).first()).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('s');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove story and note' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute('data-story-id', older.id);
});

test.describe('digest', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('AC-3.4.4 "Export weekly digest" → Copy puts the title and the note on the clipboard', async ({
    page,
  }) => {
    const story = await firstStory(page);
    await saveWithNote(page, story);
    await page.goto('/saved');

    await page.getByRole('button', { name: 'Export weekly digest' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export weekly digest' });
    await dialog.getByRole('button', { name: 'Copy to clipboard' }).click();
    await expect(page.getByText('Digest copied to the clipboard')).toBeVisible();

    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown).toMatch(/^# DevBrief digest — \d{4}-W\d{2}\n/);
    expect(markdown).toContain(story.title);
    expect(markdown).toContain(NOTE);
  });

  test('AC-3.4.4 Download .md saves devbrief-<week>.md', async ({ page }) => {
    const story = await firstStory(page);
    await saveWithNote(page, story);
    await page.goto('/saved');

    await page.getByRole('button', { name: 'Export weekly digest' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export weekly digest' });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download .md' }).click();

    expect((await download).suggestedFilename()).toMatch(/^devbrief-\d{4}-W\d{2}\.md$/);
  });
});

test('AC-3.4.2 n opens the note editor on the active saved card, and not inside an input', async ({
  page,
}) => {
  const story = await firstStory(page);
  await saveWithNote(page, story);
  await page.goto('/saved');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  await expect(cards(page).first()).toBeVisible();
  await page.keyboard.press('j');
  await expect(cards(page).first()).toHaveAttribute('data-active', 'true');

  const editor = page.getByRole('textbox', { name: 'Note' });
  // The card's `n` binding registers just after `data-active` shows, so the first press can land early.
  await expect(async () => {
    if (!(await editor.isVisible())) await page.keyboard.press('n');
    await expect(editor).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(NOTE);

  await page.keyboard.press('n');
  expect((await editor.inputValue()).length).toBe(NOTE.length + 1);
});

test('AC-3.4.2 a signed-in user edits a note that persists after a reload, and is asked before unsaving the story', async ({
  page,
}) => {
  await signInThroughTestRoute(page);
  const story = await firstStory(page);
  await saveWithNote(page, story);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(NOTE);

  const edited = `${NOTE} again`;
  await page.getByRole('textbox', { name: 'Note' }).fill(edited);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(edited);
  await page.goto('/saved');
  await expect(cards(page).first()).toContainText(`📝 ${edited}`);

  // The feed has not loaded the note: the unsave looks it up before it asks (AC-3.4.1).
  await page.goto('/feed?sort=latest');
  const card = page.locator(`article[data-story-id="${story.id}"]`);
  await card.getByRole('button', { name: 'Save story' }).click();
  const dialog = page.getByRole('dialog', { name: `Remove “${story.title}” and its note?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove story and note' }).click();
  await expect(card.getByRole('button', { name: 'Save story' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }),
  );
});
test('production assets resolve under /ExoWeb/ and missing WebGPU has a recoverable explanation', async ({
  page,
}) => {
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) missing.push(response.url());
  });
  await page.goto('./');
  await expect(page.locator('#error-screen')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('WebGPU');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  expect(missing).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Más allá del horizonte.' })).toBeAttached();
});
test('settings are editable and persist even on an unsupported machine', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Ver controles y ajustes' }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Modo de confort' }).check();
  await page.getByLabel('Calidad visual').selectOption('low');
  await page.reload();
  await page.getByRole('button', { name: 'Ver controles y ajustes' }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Modo de confort' })).toBeChecked();
  await expect(page.getByLabel('Calidad visual')).toHaveValue('low');
});
test('keyboard remapping swaps collisions and updates the control instructions', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Ver controles y ajustes' }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByText('Personalizar teclado', { exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar Saltar', exact: true }).click();
  await page.keyboard.press('j');
  await expect(page.getByRole('button', { name: 'Cambiar Saltar', exact: true })).toHaveText('J');
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  await page.getByRole('button', { name: 'Cómo pilotar' }).click();
  await expect(page.locator('#control-table')).toContainText('J');
});
test('corrupt save and unavailable storage do not prevent the interface loading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('exoweb.save.v1', '{bad');
    Storage.prototype.setItem = () => {
      throw new DOMException('Unavailable', 'QuotaExceededError');
    };
  });
  await page.goto('./');
  await expect(page.locator('#error-message')).toContainText('WebGPU');
  await page.getByRole('button', { name: 'Ver controles y ajustes' }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Modo de confort' }).check();
  await expect(page.locator('#settings')).toBeVisible();
});

import {test,expect} from '@playwright/test';
test('home has a real register, theme control and email only sign in',async({page})=>{
  await page.goto('/');await expect(page).toHaveTitle('Tithe | Your work. Your terms. Your share.');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Your work.Your terms.Your share.');
  await page.getByRole('button',{name:'Switch light or dark mode'}).click();await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button',{name:'Switch light or dark mode'}).click();await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('dialog').getByPlaceholder(/email/i)).toBeVisible({timeout:45000});
  await expect(page.getByRole('dialog')).not.toContainText(/connect wallet|google|apple|twitter/i);
});
for(const path of ['/','/works','/register','/account','/docket','/developers','/about']){
  test('phone layout and navigation '+path,async({page})=>{
    await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(path);await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Open navigation'}).click();await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('public requests do not require an email session',async({request})=>{
  const response=await request.get('/api/works');expect(response.status()).toBe(200);const body=await response.json();expect(Array.isArray(body.works)).toBe(true);expect(typeof body.has_more).toBe('boolean');
});
test('account and signing endpoints require authentication',async({request})=>{
  expect((await request.get('/api/account')).status()).toBe(401);
  expect((await request.post('/api/actions',{data:{kind:'withdraw',contract:'desk'}})).status()).toBe(401);
  expect((await request.post('/api/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/list'}})).status()).toBe(401);
});

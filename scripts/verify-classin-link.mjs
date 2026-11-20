import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/students');await page.locator('a.student-name').first().click();
await page.getByRole('button',{name:/关联账号|编辑关联/}).click();let dialog=page.getByRole('dialog');
await expect(dialog.getByLabel('ClassIn UID',{exact:true})).toHaveCount(0);
await expect(dialog.getByText('通过 UID 关联')).toHaveCount(0);
await expect(dialog.getByLabel('新账号初始密码')).toHaveCount(0);
await dialog.getByLabel('ClassIn 账号',{exact:true}).fill('student@example.com');
await expect(dialog.getByRole('checkbox')).toHaveCount(0);
await expect(dialog.getByRole('button',{name:'确认关联',exact:true})).toBeEnabled();
let calls=0;
await page.route('**/api/classin-account',async route=>{
 const body=route.request().postDataJSON();
 if(body.password || !body.name || body.role!=='student')throw new Error('Unexpected account payload');
 calls++;
 await route.fulfill({status:calls===1?503:200,contentType:'application/json',body:JSON.stringify(calls===1?{message:'该账号尚未注册 ClassIn，请先注册后再关联'}:{uid:'7654321',addedToInstitution:calls===2})});
});
await dialog.getByRole('button',{name:'确认关联',exact:true}).click();
await expect(dialog.getByRole('alert')).toContainText('尚未注册');
await dialog.getByRole('button',{name:'确认关联',exact:true}).click();
const changed=dialog.getByLabel(/确认更换原 UID/);
if(await changed.count()){await changed.check();await dialog.getByRole('button',{name:'重新保存关联'}).click();}
await expect(dialog).toHaveCount(0);
await expect(page.getByText('关联成功，学员已加入 ClassIn 机构',{exact:true})).toBeVisible();
await page.reload();
await expect(page.getByText('student@example.com',{exact:true})).toBeVisible();
await expect(page.getByText('7654321',{exact:true})).toBeVisible();
await page.getByRole('button',{name:'编辑关联'}).click();dialog=page.getByRole('dialog');
await dialog.getByRole('button',{name:'确认关联',exact:true}).click();
await expect(dialog).toHaveCount(0);
await expect(page.getByText('关联成功',{exact:true})).toBeVisible();
console.log('PASS account-only UI, unregistered error, new/existing institution messages, saved UID/account reload. ClassIn mocked, no external writes.');
}finally{await browser.close();}

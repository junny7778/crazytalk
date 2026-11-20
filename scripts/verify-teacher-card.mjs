import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const out='docs/evidence/teacher-card';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},acceptDownloads:true});
 await page.goto('http://127.0.0.1:5173/teachers/t1');
 await page.getByRole('button',{name:'编辑资料',exact:true}).click();
 let dialog=page.getByRole('dialog');
 await dialog.getByRole('checkbox',{name:'TESOL',exact:true}).check();
 await dialog.getByLabel('教育背景',{exact:true}).fill('化学工程学士学位（Bachelor of Science in Chemical Engineering）');
 await dialog.getByLabel('教学经验',{exact:true}).fill('5年以上在线 ESL 英语教学经验');
 await dialog.getByLabel('教师寄语与教学特色',{exact:true}).fill('大家好！我喜欢通过互动引导学员表达，让学习英语成为轻松而有趣的体验。');
 await dialog.getByRole('button',{name:'保存老师'}).click();
 await page.reload();await expect(page.getByText('化学工程学士学位（Bachelor of Science in Chemical Engineering）',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'生成老师简介卡'}).click();dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'复制文本'})).toHaveCount(0);
 await expect(dialog.getByText('卡片内容来自老师资料，请核对后导出。')).toHaveCount(0);
 await expect(dialog.getByAltText('老师简介卡预览')).toBeVisible({timeout:20000});
 const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出图片'}).click();await(await download).saveAs(out+'/teacher-card.png');
 const dimensions=await dialog.getByAltText('老师简介卡预览').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));expect(dimensions.width).toBe(1200);
 await expect(dialog.getByText('调整卡片内容',{exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('textbox')).toHaveCount(0);
 console.log('PASS education save/reload; preview only with no editor or copy; real 1200px PNG download',dimensions);
}finally{await browser.close();}

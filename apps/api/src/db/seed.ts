import { db } from './client';
import { items } from './schema';

async function seed() {
  await db.insert(items).values([
    { name: '炎の剣', description: '炎を纏った魔法の剣', rarity: 'rare', price: 5000 },
    { name: '回復薬', description: 'HPを100回復する', rarity: 'common', price: 100 },
    { name: '龍の鱗', description: '伝説のドラゴンの鱗', rarity: 'legendary', price: 50000 },
    { name: '鉄の盾', description: '頑丈な鉄製の盾', rarity: 'uncommon', price: 800 },
    { name: '魔法の杖', description: '魔力を増幅させる杖', rarity: 'epic', price: 12000 },
  ]);
  console.log('Seed data inserted');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

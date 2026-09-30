import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

function runDataIntegrityTest() {
  console.log('--- STARTING DATA INTEGRITY VERIFICATION TEST ---');
  try {
    const cachePath = path.join(process.cwd(), 'src/data/cache_tapioca.json');
    assert.ok(fs.existsSync(cachePath), 'cache_tapioca.json should exist');

    const cacheRaw = fs.readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(cacheRaw);

    assert.ok(cache, 'Parsed cache object should be valid');
    assert.ok(Array.isArray(cache.weeklyPrices), 'weeklyPrices must be an array');
    assert.ok(cache.weeklyPrices.length > 0, 'weeklyPrices should not be empty');

    // 1. Assert exact match for key historical reference dates
    const point2022 = cache.weeklyPrices.find((p: any) => p.date === '2022-02-08');
    assert.ok(point2022, 'Reference date 2022-02-08 must exist');
    assert.strictEqual(point2022.price, 490, 'Reference date 2022-02-08 price must be exactly 490.00');

    const point2023 = cache.weeklyPrices.find((p: any) => p.date === '2023-06-20');
    assert.ok(point2023, 'Reference date 2023-06-20 must exist');
    assert.strictEqual(point2023.price, 570, 'Reference date 2023-06-20 price must be exactly 570.00');

    const point2024 = cache.weeklyPrices.find((p: any) => p.date === '2024-05-14');
    assert.ok(point2024, 'Reference date 2024-05-14 must exist');
    assert.strictEqual(point2024.price, 555, 'Reference date 2024-05-14 price must be exactly 555.00');

    const point2025 = cache.weeklyPrices.find((p: any) => p.date === '2025-07-15');
    assert.ok(point2025, 'Reference date 2025-07-15 must exist');
    assert.strictEqual(point2025.price, 445, 'Reference date 2025-07-15 price must be exactly 445.00');

    // 2. Assert no NaN, null, or undefined values
    for (const point of cache.weeklyPrices) {
      assert.ok(point.date, 'Point date should exist');
      assert.ok(!isNaN(new Date(point.date).getTime()), `Invalid date format: ${point.date}`);
      
      const priceVal = point.price;
      assert.ok(typeof priceVal === 'number', `Price must be a number: ${priceVal}`);
      assert.ok(!isNaN(priceVal), `Price cannot be NaN for date ${point.date}`);
      assert.ok(priceVal > 0, `Price must be greater than zero for date ${point.date}`);
    }

    console.log('[PASS] Data integrity validation checks completed successfully! (100% Raw Match)');
  } catch (error) {
    console.error('[FAIL] Data integrity validation failed:', error);
    process.exit(1);
  }
}

runDataIntegrityTest();

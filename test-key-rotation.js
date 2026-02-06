import { getGroqKey } from './utils/getGroqApiKey.js';

console.log('\n🔄 Testing API Key Rotation...\n');
console.log('='.repeat(50));

for (let i = 1; i <= 6; i++) {
    const key = getGroqKey();
    const keyPreview = key.substring(0, 15) + '...';
    console.log(`Call ${i}: ${keyPreview}`);
}

console.log('='.repeat(50));
console.log('\n✅ If you see 3 different keys cycling, rotation is working!\n');

import {defineConfig} from '@playwright/test';
// CI runner (windows-latest, 4 vCPU, ไม่มี GPU) วาด WebGL ด้วย SwiftShader บน CPU จึงจำกัด workers ไม่ให้แย่ง CPU กับ dev server
export default defineConfig({testDir:'tests/e2e',fullyParallel:true,workers:process.env.CI?2:undefined,use:{baseURL:'http://127.0.0.1:1420',channel:'msedge',headless:true,screenshot:'only-on-failure'},webServer:{command:'pnpm dev',url:'http://127.0.0.1:1420',reuseExistingServer:!process.env.CI,timeout:30000},reporter:'list'});

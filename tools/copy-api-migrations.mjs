import {cpSync} from 'node:fs';
cpSync(new URL('../apps/api/migrations',import.meta.url),new URL('../apps/api/dist/apps/api/migrations',import.meta.url),{recursive:true});

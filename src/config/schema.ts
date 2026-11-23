import { z } from 'zod';

// Use Zod's interpreter. Its default JavaScript compilation probe violates the script policy.
z.config({ jitless: true });

export { z };

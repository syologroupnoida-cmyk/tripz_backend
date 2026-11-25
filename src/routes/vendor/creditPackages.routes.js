import { Router } from 'express';
import * as controller from '../../controllers/creditPackage.controller.js';

const router = Router();
router.get('/', controller.listVendor);
export default router;

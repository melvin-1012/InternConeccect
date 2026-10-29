import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";
import placementRouter from "./placement";
import publicRouter from "./public";
import recruiterRouter from "./recruiter";
import storageRouter from "./storage";
import studentRouter from "./student";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(publicRouter);
router.use(studentRouter);
router.use(recruiterRouter);
router.use(storageRouter);
router.use(placementRouter);
router.use(adminRouter);

export default router;

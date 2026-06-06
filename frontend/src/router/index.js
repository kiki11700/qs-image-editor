import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import Login from "../views/Login.vue";
import Recharge from "../views/Recharge.vue";
import History from "../views/History.vue";
import Workflow from "../views/Workflow.vue";

const routes = [
  { path: "/", name: "Home", component: Home },
  { path: "/login", name: "Login", component: Login },
  { path: "/recharge", name: "Recharge", component: Recharge },
  { path: "/history", name: "History", component: History },
  { path: "/workflow", name: "Workflow", component: Workflow },
];

const router = createRouter({ history: createWebHistory(), routes });
export default router;

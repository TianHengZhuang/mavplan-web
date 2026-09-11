import { createRouter, createWebHashHistory } from 'vue-router'
import EditorView from '../views/EditorView.vue'
import PreflightView from '../views/PreflightView.vue'
import AboutView from '../views/AboutView.vue'

/**
 * Hash history keeps the console working from `file://` and from any static
 * sub-path (teaching laptops, USB sticks, intranet hosting) without server
 * rewrite rules.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'editor', component: EditorView },
    { path: '/preflight', name: 'preflight', component: PreflightView },
    { path: '/about', name: 'about', component: AboutView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

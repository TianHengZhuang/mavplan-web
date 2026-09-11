import { createRouter, createWebHashHistory } from 'vue-router'
import EditorView from '../views/EditorView.vue'
import DashboardView from '../views/DashboardView.vue'
import PlaybackView from '../views/PlaybackView.vue'
import PreflightView from '../views/PreflightView.vue'
import ReportView from '../views/ReportView.vue'
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
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/playback', name: 'playback', component: PlaybackView },
    { path: '/preflight', name: 'preflight', component: PreflightView },
    { path: '/report', name: 'report', component: ReportView },
    { path: '/about', name: 'about', component: AboutView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

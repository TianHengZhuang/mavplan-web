<script setup lang="ts">
/**
 * About view — what the console is, what it talks to, and where it sits in the
 * mavplan family.
 */
import CliCompanion from '../components/CliCompanion.vue'
import { t } from '../core/i18n'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const features = [
  {
    zh: '航点增删改、拖拽定位、指令与动作项混排、HOME 设置',
    en: 'Create, edit, drag and re-order waypoints; mix navigation items with actions; set HOME'
  },
  {
    zh: '环绕、多边形测区等自动航迹生成',
    en: 'Circular orbit and polygon survey pattern generators'
  },
  {
    zh: '安全预检：限高 / 限距 / 转弯半径 / 禁飞区（圆与多边形、限高）/ 电池与能耗',
    en: 'Preflight: altitude and distance envelopes, turn radius, circular + polygon no-fly zones with ceilings, battery model'
  },
  {
    zh: '多格式导入导出：mavplan JSON、QGC .plan、QGC WPL 110/120、KML、CSV',
    en: 'Import/export: mavplan JSON, QGC .plan, QGC WPL 110/120, KML, CSV'
  },
  {
    zh: '中英文双语、离线可用、localStorage 自动持久化',
    en: 'Chinese/English UI, works offline, mission and settings persisted in localStorage'
  }
]

const shortcuts = [
  { keys: '?', zh: '打开快捷键帮助浮层', en: 'Open the shortcut help overlay' },
  { keys: '↑ / ↓ · Enter · Delete', zh: '航点表选择 / 编辑 / 删除', en: 'Waypoint table select / edit / delete' },
  { keys: 'Ctrl / ⌘ + Z', zh: '撤销任务结构变更', en: 'Undo mission structure changes' },
  { keys: 'Ctrl / ⌘ + Shift + Z / Y', zh: '重做', en: 'Redo' }
]
</script>

<template>
  <div class="view about">
    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('about.title') }}</h3>
        <span class="badge muted mono">v1.14.3</span>
        <span class="badge muted mono">MIT</span>
      </div>
      <div class="panel-body">
        <p class="lead">{{ t('about.body') }}</p>
        <p class="muted">{{ t('about.formats') }}</p>
        <p class="muted">{{ t('about.cli') }}</p>

        <ul class="features">
          <li v-for="(feature, index) in features" :key="index">
            {{ settings.locale === 'zh-CN' ? feature.zh : feature.en }}
          </li>
        </ul>

        <table class="shortcuts">
          <thead>
            <tr>
              <th>{{ settings.locale === 'zh-CN' ? '快捷键' : 'Shortcut' }}</th>
              <th>{{ settings.locale === 'zh-CN' ? '作用' : 'Action' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in shortcuts" :key="row.keys">
              <td class="mono">{{ row.keys }}</td>
              <td>{{ settings.locale === 'zh-CN' ? row.zh : row.en }}</td>
            </tr>
          </tbody>
        </table>

        <p class="muted">
          <a href="https://github.com/TianHengZhuang/mavplan" target="_blank" rel="noreferrer">mavplan</a>
          ·
          <a href="https://github.com/TianHengZhuang/mavplan-web" target="_blank" rel="noreferrer">mavplan-web</a>
          ·
          <span class="mono">npm install &amp;&amp; npm run dev</span>
        </p>
      </div>
    </section>

    <CliCompanion style="margin-top: 12px" />
  </div>
</template>

<style scoped>
.about {
  max-width: 880px;
}

.lead {
  margin-top: 0;
  font-size: 13.5px;
  line-height: 1.7;
}

.muted {
  color: var(--muted);
  font-size: 12.5px;
}

.features {
  margin: 10px 0 14px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}

.shortcuts {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  margin-bottom: 12px;
}

.shortcuts th,
.shortcuts td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

a {
  color: var(--accent);
}
</style>

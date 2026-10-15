<script setup lang="ts">
/**
 * About view — what the console is, what it talks to, and where it sits in the
 * mavplan family.
 */
import CliCompanion from '../components/CliCompanion.vue'
import { t } from '../core/i18n'
</script>

<template>
  <div class="view about">
    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('about.title') }}</h3>
        <span class="badge muted mono">{{ t('about.version') }}</span>
        <span class="badge muted mono">{{ t('about.license') }}</span>
      </div>
      <div class="panel-body">
        <p class="lead">{{ t('about.body') }}</p>
        <p class="muted">{{ t('about.formats') }}</p>
        <p class="muted">{{ t('about.cli') }}</p>

        <ul class="features">
          <li v-for="index in 5" :key="index">{{ t(`about.feat.${index}`) }}</li>
        </ul>

        <p class="muted">
          {{ t('about.runHint') }}
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

a {
  color: var(--accent);
}
</style>

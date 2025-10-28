<template>
  <h3 :class="cn('font-semibold leading-none tracking-tight text-2xl', props.class)">
    <slot />
  </h3>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>
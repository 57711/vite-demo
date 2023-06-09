<template>
    <div class="bold">我现在是数字是的:{{ message }}</div>
    <button v-on:click="handleClick1">增加</button>
    <button v-on:click="handleClick2">减小</button>
</template>

<script>
export default {
    data() {
        return {
            message: 0,
        };
    },
    methods: {
        handleClick1() {
            this.message += 1;
        },
        handleClick2() {
            this.message -= 1;
        },
    },
};
</script>

<style scoped>
.bold {
  font-weight: bold;
}
</style>
  
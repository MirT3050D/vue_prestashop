<script setup>
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
const props = defineProps(['dropdown_title', 'contents']);
const click = ref(false);
function clickOnDropDown() {
    console.log("oui je clique");
    console.log("ref = ", click);
    console.log("ref value", ref.value)
    
    if (click.value) {
        click.value = false;
    }
    else {
        click.value = true;
    }

}
</script>

<template>
    <div class="boite">
        <h3>
            <Icon
                v-if="dropdown_title?.icon"
                class="title-icon"
                :icon="dropdown_title.icon"
                width="18"
                height="18"
            />
            <span>{{ dropdown_title?.label ?? dropdown_title }}</span>
        </h3>
        <Icon
            icon="nrk:arrow-dropdown"
            width="24"
            height="24"
            :class="{ open: click }"
            @click="clickOnDropDown"
        />
        <div class="elements" v-if="click" v-for="content in contents">
            <ul>
                <RouterLink :to="content.url">
                    <li>
                        {{ content.label }}
                    </li>
                </RouterLink>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.boite {
    --text: #0f172a;
    --accent: #2563eb;
    color: var(--text);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.12);
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px 12px;
    max-width: 520px;
    transition: box-shadow 200ms ease, transform 200ms ease;
}

.boite:hover {
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.16);
    transform: translateY(-1px);
}

.boite h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.2px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.boite :deep(.title-icon) {
    flex-shrink: 0;
}

.boite :deep(svg) {
    color: var(--accent);
    padding: 6px;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 200ms ease;
}

.boite :deep(svg).open {
    transform: rotate(180deg);
}

.boite :deep(svg):hover {
    animation: iconPop 200ms ease-out;
}

.elements {
    grid-column: 1 / -1;
    border-radius: 10px;
    padding: 10px 12px;
    margin-top: 6px;
    animation: dropdownFade 180ms ease-out;
}

.elements ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.elements li {
    padding: 8px 10px;
    border-radius: 8px;
    transition: color 160ms ease;
}

.elements li:hover {
    color: var(--accent);
}

@keyframes dropdownFade {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes iconPop {
    0% {
        transform: scale(1);
    }
    60% {
        transform: scale(1.08);
    }
    100% {
        transform: scale(1);
    }
}
</style>
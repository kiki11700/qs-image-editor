import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useUserStore = defineStore("user", () => {
  const token = ref(localStorage.getItem("token") || "");
  const user = ref(null);

  const isLoggedIn = computed(() => !!token.value);
  const credits = computed(() => user.value?.credits ?? 0);
  const username = computed(() => user.value?.username ?? "");

  function setAuth(t, u) {
    token.value = t;
    user.value = u;
    localStorage.setItem("token", t);
  }

  function logout() {
    token.value = "";
    user.value = null;
    localStorage.removeItem("token");
  }

  function updateCredits(c) {
    if (user.value) user.value.credits = c;
  }

  return { token, user, isLoggedIn, credits, username, setAuth, logout, updateCredits };
});

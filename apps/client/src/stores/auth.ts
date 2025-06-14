// 简化的本地应用状态存储
// 不再需要用户认证，所有数据都存储在本地

// 本地用户ID常量，与后端保持一致
const LOCAL_USER_ID = "local-user-id";

export const useAuthStore = () => ({
  user: {
    id: LOCAL_USER_ID,
    name: "本地用户",
    email: "local@example.com",
    username: "local-user",
    locale: "zh-CN",
  }, // 本地用户数据，与后端返回的格式一致
  setUser: () => {}, // 空函数，保持兼容性
});

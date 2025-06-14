// 本地用户服务 - 不再依赖服务器
export const fetchUser = () => {
  // 返回模拟的本地用户数据
  return {
    id: 'local-user',
    name: 'Local User', // eslint-disable-line lingui/no-unlocalized-strings
    email: 'local@example.com',
    username: 'local-user',
    locale: 'zh-CN',
  };
};

export const useUser = () => {
  // 直接返回本地用户数据，不需要查询服务器
  const user = {
    id: 'local-user',
    name: 'Local User', // eslint-disable-line lingui/no-unlocalized-strings
    email: 'local@example.com',
    username: 'local-user',
    locale: 'zh-CN',
  };

  return { 
    user, 
    loading: false, 
    error: null 
  };
};

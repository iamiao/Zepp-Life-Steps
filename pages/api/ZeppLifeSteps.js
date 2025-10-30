const axios = require('axios');
const { URLSearchParams } = require('url');

// 配置请求头
const headers = {
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; MI 6 MIUI/20.6.18)',
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive'
};

// 创建axios实例
const axiosInstance = axios.create({
  timeout: 30000,
  headers: headers
});

// 获取登录code
async function getCode(location) {
  // 检查是否包含错误信息
  if (location.includes('error=')) {
    const errorPattern = /error=(\d+)/;
    const errorMatch = location.match(errorPattern);
    if (errorMatch) {
      throw new Error(`登录失败，错误码: ${errorMatch[1]}`);
    }
  }
  
  // 尝试多种可能的code提取模式
  const patterns = [
    /(?<=access=).*?(?=&|$)/,
    /code=([^&]+)/,
    /token=([^&]+)/
  ];
  
  for (const pattern of patterns) {
    const match = location.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  throw new Error('无法从重定向URL中提取授权码');
}

// 登录获取token
async function login(account, password) {
  try {
    // 判断是手机号还是邮箱
    const isPhone = /^\+?\d+$/.test(account);
    console.log('登录账号类型:', isPhone ? '手机号' : '邮箱');
    
    // 对于手机号，检查是否有+86前缀，如果没有则添加
    if (isPhone) {
      // 检查是否已经有+86前缀
      if (!account.startsWith('+86') && !account.startsWith('86')) {
        // 没有86前缀，添加+86
        account = '+86' + account;
      } else if (account.startsWith('86') && !account.startsWith('+')) {
        // 有86但没有+号，添加+号
        account = '+' + account;
      }
      console.log('处理后的手机号:', account);
    }
    
    console.log('登录账号:', account);

    // 第一步：获取access code
    // 尝试多个可能的API端点
    const endpoints = [
      `https://api-user.huami.com/registrations/${account}/tokens`,
      `https://api-user-us.huami.com/registrations/${account}/tokens`
    ];
    
    let response1;
    let url1;
    
    for (const endpoint of endpoints) {
      url1 = endpoint;
      const data1 = {
        client_id: 'HuaMi',
        password: password,
        redirect_uri: 'https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html',
        token: 'access'
      };

    // 如果是手机号,添加phone_number字段
    if(isPhone) {
      data1.phone_number = account;
    }

      console.log('第一步请求URL:', url1);
      console.log('第一步请求数据:', data1);

      let continueLoop = false;
      try {
        // 准备请求参数，使用URLSearchParams格式化
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(data1)) {
          searchParams.append(key, value);
        }
        
        console.log(`尝试端点 ${url1}，参数:`, searchParams.toString());
        
        response1 = await axiosInstance.post(url1, searchParams.toString(), {
          maxRedirects: 0,
          validateStatus: function (status) {
            // 允许302重定向和401（用于调试）
            return (status >= 200 && status < 400) || status === 302 || status === 401;
          }
        });
        
        console.log(`端点 ${url1} 响应状态码:`, response1.status);
        
        // 如果是401，记录但继续尝试下一个端点
        if (response1.status === 401) {
          console.warn(`端点 ${url1} 返回401未授权`);
          continueLoop = true;
        } else if (response1.headers.location) {
          // 如果成功获取到响应且有location头，跳出循环
          console.log(`在端点 ${url1} 成功获取到location头`);
          break;
        }
      } catch (error) {
        console.warn(`尝试端点 ${url1} 失败:`, error.message);
        continueLoop = true;
      }
      
      if (continueLoop) {
        // 继续循环下一个端点
        continue;
      }
    }

    console.log('第一步响应状态码:', response1.status);
    console.log('第一步响应头:', response1.headers);
    console.log('第一步响应数据:', response1.data);

    // 从重定向URL中提取code
    const location = response1.headers.location;
    if (!location) {
      console.error('登录失败：未获取到重定向URL');
      throw new Error('登录失败：未获取到重定向URL');
    }

    console.log('重定向URL:', location);

    // 尝试从location中获取code
    const code = await getCode(location);
    console.log('成功获取到code:', code);

    console.log('获取到的code:', code);

    // 第二步：获取login token
    const loginEndpoints = [
      'https://account.huami.com/v2/client/login',
      'https://account-us.huami.com/v2/client/login'
    ];
    let response2;
    
    for (const loginUrl of loginEndpoints) {
      const data2 = {
        allow_registration: 'false',
        app_name: 'com.xiaomi.hm.health',
        app_version: '6.3.5',
        code: code,
        country_code: 'CN',
        device_id: '2C8B4939-0CCD-4E94-8CBA-CB8EA6E613A1',
        device_model: 'phone',
        dn: 'api-user.huami.com%2Capi-mifit.huami.com%2Capp-analytics.huami.com',
        grant_type: 'access_token',
        lang: 'zh_CN',
        os_version: '1.5.0',
        source: 'com.xiaomi.hm.health',
        third_name: isPhone ? 'huami_phone' : 'email'
      };

      console.log('第二步请求URL:', loginUrl);
      console.log('第二步请求数据:', data2);
      
      // 准备请求参数
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(data2)) {
        searchParams.append(key, value);
      }

      let continueLoop = false;
      try {
        response2 = await axiosInstance.post(loginUrl, searchParams.toString(), {
          validateStatus: function (status) {
            return (status >= 200 && status < 400) || status === 401;
          }
        });
        
        console.log(`登录端点 ${loginUrl} 响应状态码:`, response2.status);
        
        // 如果是401，记录并继续到下一个端点
        if (response2.status === 401) {
          console.warn(`登录端点 ${loginUrl} 返回401未授权`);
          continueLoop = true;
        } else if (response2.data && response2.data.token_info) {
          // 检查响应数据是否有效
          break;
        }
      } catch (error) {
        console.warn(`尝试登录端点 ${loginUrl} 失败:`, error.message);
        continueLoop = true;
      }
      
      if (!continueLoop && response2.data && response2.data.token_info) {
        // 找到有效响应，跳出循环
        break;
      }
    }

    console.log('第二步响应状态码:', response2.status);
    console.log('第二步响应头:', response2.headers);
    console.log('第二步响应数据:', response2.data);

    if (!response2.data || !response2.data.token_info) {
      console.error('登录失败：未获取到token信息');
      throw new Error('登录失败：未获取到token信息');
    }

    const loginToken = response2.data.token_info.login_token;
    const userId = response2.data.token_info.user_id;

    if (!loginToken || !userId) {
      console.error('登录失败：token信息不完整');
      throw new Error('登录失败：token信息不完整');
    }

    console.log('登录成功,获取到loginToken和userId');
    return { loginToken, userId };
  } catch (error) {
    console.error('登录失败:', error.message);
    if (error.response) {
      console.error('错误响应状态码:', error.response.status);
      console.error('错误响应头:', error.response.headers);
      console.error('错误响应数据:', error.response.data);
    }
    // 提供更友好的错误信息
    const errorMessages = {
      '401': '账号或密码错误，请检查输入',
      '403': '请求被拒绝，请稍后重试',
      '429': '请求过于频繁，请稍后重试',
      '500': '服务器内部错误，请稍后重试'
    };
    
    const errorCode = error.message.match(/错误码: (\d+)/);
    if (errorCode && errorMessages[errorCode[1]]) {
      throw new Error(errorMessages[errorCode[1]]);
    }
    
    throw new Error(`登录失败: ${error.message || '未知错误'}`);
  }
}

// 获取app token
async function getAppToken(loginToken) {
  try {
    // 直接从登录响应中获取app_token
    const url = `https://account-cn.huami.com/v1/client/app_tokens?app_name=com.xiaomi.hm.health&dn=api-user.huami.com%2Capi-mifit.huami.com%2Capp-analytics.huami.com&login_token=${loginToken}`;

    console.log('获取appToken请求URL:', url);

    const response = await axiosInstance.get(url, {
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });

    console.log('获取appToken响应状态码:', response.status);
    console.log('获取appToken响应头:', response.headers);
    console.log('获取appToken响应数据:', response.data);

    if (!response.data || !response.data.token_info) {
      console.error('获取appToken失败：未获取到token信息');
      throw new Error('获取appToken失败：未获取到token信息');
    }

    const appToken = response.data.token_info.app_token;
    if (!appToken) {
      console.error('获取appToken失败：token信息不完整');
      throw new Error('获取appToken失败：token信息不完整');
    }

    console.log('获取appToken成功:', appToken);
    return appToken;
  } catch (error) {
    console.error('获取appToken失败:', error.message);
    if (error.response) {
      console.error('错误响应状态码:', error.response.status);
      console.error('错误响应头:', error.response.headers);
      console.error('错误响应数据:', error.response.data);
    }
    throw error;
  }
}

// 获取时间戳
async function getTime() {
  try {
    const response = await axios.get('http://mshopact.vivo.com.cn/tool/config', { headers });
    return response.data.data.nowTime;
  } catch (error) {
    console.error('获取时间戳失败:', error.message);
    throw error;
  }
}

// 修改步数
function getBeijingTime() {
  const now = new Date();
  // 本地时间戳（毫秒） + 8小时毫秒数
  const beijingTimestamp = now.getTime() + 8 * 60 * 60 * 1000;
  return new Date(beijingTimestamp);
}

// 修改步数
async function updateSteps(loginToken, appToken, steps) {
  try {
    const beijingTime = getBeijingTime();
    const today = beijingTime.toISOString().split('T')[0]; // YYYY-MM-DD
    console.log('当前日期:', today);
    console.log('目标步数:', steps);
    const dataJson = `[{"data_hr":"\/\/\/\/\/\/9L\/\/\/\/\/\/\/\/\/\/\/\/Vv\/\/\/\/\/\/\/\/\/\/\/0v\/\/\/\/\/\/\/\/\/\/\/9e\/\/\/\/\/0n\/a\/\/\/S\/\/\/\/\/\/\/\/\/\/\/\/0b\/\/\/\/\/\/\/\/\/\/1FK\/\/\/\/\/\/\/\/\/\/\/\/R\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/9PTFFpaf9L\/\/\/\/\/\/\/\/\/\/\/\/R\/\/\/\/\/\/\/\/\/\/\/\/0j\/\/\/\/\/\/\/\/\/\/\/9K\/\/\/\/\/\/\/\/\/\/\/\/Ov\/\/\/\/\/\/\/\/\/\/\/zf\/\/\/86\/zr\/Ov88\/zf\/Pf\/\/\/0v\/S\/8\/\/\/\/\/\/\/\/\/\/\/\/\/Sf\/\/\/\/\/\/\/\/\/\/\/z3\/\/\/\/\/\/0r\/Ov\/\/\/\/\/\/S\/9L\/zb\/Sf9K\/0v\/Rf9H\/zj\/Sf9K\/0\/\/N\/\/\/\/0D\/Sf83\/zr\/Pf9M\/0v\/Ov9e\/\/\/\/\/\/\/\/\/\/\/\/S\/\/\/\/\/\/\/\/\/\/\/\/zv\/\/z7\/O\/83\/zv\/N\/83\/zr\/N\/86\/z\/\/Nv83\/zn\/Xv84\/zr\/PP84\/zj\/N\/9e\/zr\/N\/89\/03\/P\/89\/z3\/Q\/9N\/0v\/Tv9C\/0H\/Of9D\/zz\/Of88\/z\/\/PP9A\/zr\/N\/86\/zz\/Nv87\/0D\/Ov84\/0v\/O\/84\/zf\/MP83\/zH\/Nv83\/zf\/N\/84\/zf\/Of82\/zf\/OP83\/zb\/Mv81\/zX\/R\/9L\/0v\/O\/9I\/0T\/S\/9A\/zn\/Pf89\/zn\/Nf9K\/07\/N\/83\/zn\/Nv83\/zv\/O\/9A\/0H\/Of8\/\/zj\/PP83\/zj\/S\/87\/zj\/Nv84\/zf\/Of83\/zf\/Of83\/zb\/Nv9L\/zj\/Nv82\/zb\/N\/85\/zf\/N\/9J\/zf\/Nv83\/zj\/Nv84\/0r\/Sv83\/zf\/MP\/\/\/zb\/Mv82\/zb\/Of85\/z7\/Nv8\/\/0r\/S\/85\/0H\/QP9B\/0D\/Nf89\/zj\/Ov83\/zv\/Nv8\/\/0f\/Sv9O\/0ZeXv\/\/\/\/\/\/\/\/\/\/\/1X\/\/\/\/\/\/\/\/\/\/\/9B\/\/\/\/\/\/\/\/\/\/\/\/TP\/\/\/1b\/\/\/\/\/\/0\/\/\/\/\/\/\/\/\/\/\/\/9N\/\/\/\/\/\/\/\/\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+\/v7+","date":"${today}","data":[{"start":0,"stop":1439,"value":"UA8AUBQAUAwAUBoAUAEAYCcAUBkAUB4AUBgAUCAAUAEAUBkAUAwAYAsAYB8AYB0AYBgAYCoAYBgAYB4AUCcAUBsAUB8AUBwAUBIAYBkAYB8AUBoAUBMAUCEAUCIAYBYAUBwAUCAAUBgAUCAAUBcAYBsAYCUAATIPYD0KECQAYDMAYB0AYAsAYCAAYDwAYCIAYB0AYBcAYCQAYB0AYBAAYCMAYAoAYCIAYCEAYCYAYBsAYBUAYAYAYCIAYCMAUB0AUCAAUBYAUCoAUBEAUC8AUB0AUBYAUDMAUDoAUBkAUC0AUBQAUBwAUA0AUBsAUAoAUCEAUBYAUAwAUB4AUAwAUCcAUCYAUCwKYDUAAUUlEC8IYEMAYEgAYDoAYBAAUAMAUBkAWgAAWgAAWgAAWgAAWgAAUAgAWgAAUBAAUAQAUA4AUA8AUAkAUAIAUAYAUAcAUAIAWgAAUAQAUAkAUAEAUBkAUCUAWgAAUAYAUBEAWgAAUBYAWgAAUAYAWgAAWgAAWgAAWgAAUBcAUAcAWgAAUBUAUAoAUAIAWgAAUAQAUAYAUCgAWgAAUAgAWgAAWgAAUAwAWwAAXCMAUBQAWwAAUAIAWgAAWgAAWgAAWgAAWgAAWgAAWgAAWgAAWREAWQIAUAMAWSEAUDoAUDIAUB8AUCEAUC4AXB4AUA4AWgAAUBIAUA8AUBAAUCUAUCIAUAMAUAEAUAsAUAMAUCwAUBYAWgAAWgAAWgAAWgAAWgAAWgAAUAYAWgAAWgAAWgAAUAYAWwAAWgAAUAYAXAQAUAMAUBsAUBcAUCAAWwAAWgAAWgAAWgAAWgAAUBgAUB4AWgAAUAcAUAwAWQIAWQkAUAEAUAIAWgAAUAoAWgAAUAYAUB0AWgAAWgAAUAkAWgAAWSwAUBIAWgAAUC4AWSYAWgAAUAYAUAoAUAkAUAIAUAcAWgAAUAEAUBEAUBgAUBcAWRYAUA0AWSgAUB4AUDQAUBoAXA4AUA8AUBwAUA8AUA4AUA4AWgAAUAIAUCMAWgAAUCwAUBgAUAYAUAAAUAAAUAAAUAAAUAAAUAAAUAAAUAAAUAAAWwAAUAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAeSEAeQ8AcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcBcAcAAAcAAAcCYOcBUAUAAAUAAAUAAAUAAAUAUAUAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcCgAeQAAcAAAcAAAcAAAcAAAcAAAcAYAcAAAcBgAeQAAcAAAcAAAegAAegAAcAAAcAcAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcCkAeQAAcAcAcAAAcAAAcAwAcAAAcAAAcAIAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcCIAeQAAcAAAcAAAcAAAcAAAcAAAeRwAeQAAWgAAUAAAUAAAUAAAUAAAUAAAcAAAcAAAcBoAeScAeQAAegAAcBkAeQAAUAAAUAAAUAAAUAAAUAAAUAAAcAAAcAAAcAAAcAAAcAAAcAAAegAAegAAcAAAcAAAcBgAeQAAcAAAcAAAcAAAcAAAcAAAcAkAegAAegAAcAcAcAAAcAcAcAAAcAAAcAAAcAAAcA8AeQAAcAAAcAAAeRQAcAwAUAAAUAAAUAAAUAAAUAAAUAAAcAAAcBEAcA0AcAAAWQsAUAAAUAAAUAAAUAAAUAAAcAAAcAoAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAYAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcBYAegAAcAAAcAAAegAAcAcAcAAAcAAAcAAAcAAAcAAAeRkAegAAegAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAEAcAAAcAAAcAAAcAUAcAQAcAAAcBIAeQAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcBsAcAAAcAAAcBcAeQAAUAAAUAAAUAAAUAAAUAAAUBQAcBYAUAAAUAAAUAoAWRYAWTQAWQAAUAAAUAAAUAAAcAAAcAAAcAAAcAAAcAAAcAMAcAAAcAQAcAAAcAAAcAAAcDMAeSIAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcAAAcBQAeQwAcAAAcAAAcAAAcAMAcAAAeSoAcA8AcDMAcAYAeQoAcAwAcFQAcEMAeVIAaTYAbBcNYAsAYBIAYAIAYAIAYBUAYCwAYBMAYDYAYCkAYDcAUCoAUCcAUAUAUBAAWgAAYBoAYBcAYCgAUAMAUAYAUBYAUA4AUBgAUAgAUAgAUAsAUAsAUA4AUAMAUAYAUAQAUBIAASsSUDAAUDAAUBAAYAYAUBAAUAUAUCAAUBoAUCAAUBAAUAoAYAIAUAQAUAgAUCcAUAsAUCIAUCUAUAoAUA4AUB8AUBkAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAA","tz":32,"did":"DA932FFFFE8816E7","src":24}],"summary":"{\\"v\\":6,\\"slp\\":{\\"st\\":1628296479,\\"ed\\":1628296479,\\"dp\\":0,\\"lt\\":0,\\"wk\\":0,\\"usrSt\\":-1440,\\"usrEd\\":-1440,\\"wc\\":0,\\"is\\":0,\\"lb\\":0,\\"to\\":0,\\"dt\\":0,\\"rhr\\":0,\\"ss\\":0},\\"stp\\":{\\"ttl\\":${steps},\\"dis\\":10627,\\"cal\\":510,\\"wk\\":41,\\"rn\\":50,\\"runDist\\":7654,\\"runCal\\":397,\\"stage\\":[]},\\"goal\\":8000,\\"tz\\":\\"28800\\"}","source":24,"type":0}]`;

    const timestamp = new Date().getTime();
    const t = String(parseInt((new Date).getTime() / 1000 + ''));

    const url = `https://api-mifit-cn2.huami.com/v1/data/band_data.json?t=${timestamp}`;
    const data = `userid=${loginToken}&last_sync_data_time=${t}&device_type=0&last_deviceid=DA932FFFFE8816E7&data_json=${dataJson}`;

    console.log('更新步数请求URL:', url);
    console.log('更新步数请求数据:', data);

    const response = await axiosInstance.post(url, data, {
      headers: {
        ...headers,
        apptoken: appToken
      },
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });

    console.log('更新步数响应状态码:', response.status);
    console.log('更新步数响应头:', response.headers);
    console.log('更新步数响应数据:', response.data);

    if (response.data.code === 0 || response.data.code === 200) {
      console.log('步数更新成功');
      return { success: true, message: '步数更新成功' };
    } else {
      console.error('步数更新失败:', response.data);
      throw new Error(`步数更新失败: ${response.data.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('更新步数失败:', error.message);
    if (error.response) {
      console.error('错误响应状态码:', error.response.status);
      console.error('错误响应头:', error.response.headers);
      console.error('错误响应数据:', error.response.data);
    }
    throw error;
  }
}

// 导出函数
module.exports = {
  login,
  getAppToken,
  updateSteps
};

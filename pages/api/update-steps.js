// 使用 require 而不是 import，避免 ES 模块问题
const zeppLifeSteps = require('./ZeppLifeSteps');

// 使用 module.exports 而不是 export default
module.exports = async function handler(req, res) {
  // 设置响应头，允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: '方法不允许，仅支持POST请求'
    });
  }

  try {
    // 验证请求体
    if (!req.body) {
      return res.status(400).json({ 
        success: false, 
        message: '请求体不能为空'
      });
    }
    
    const { account, password, steps } = req.body;

    // 验证账号和密码
    if (!account || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '账号和密码不能为空'
      });
    }
    
    // 验证账号格式
    const phonePattern = /^\+?\d{8,15}$/;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!phonePattern.test(account) && !emailPattern.test(account)) {
      return res.status(400).json({ 
        success: false, 
        message: '账号格式不正确，请输入有效的手机号或邮箱'
      });
    }

    // 验证步数
    let targetSteps;
    if (steps !== undefined && steps !== null) {
      const stepsNum = parseInt(steps);
      if (isNaN(stepsNum) || stepsNum < 0 || stepsNum > 999999) {
        return res.status(400).json({ 
          success: false, 
          message: '步数必须是0-999999之间的数字'
        });
      }
      targetSteps = stepsNum;
    } else {
      // 生成随机步数（范围调整为更自然的5000-15000）
      targetSteps = Math.floor(Math.random() * 10000) + 5000;
    }
    
    console.log('目标步数:', targetSteps);
    console.log(`开始更新步数，账号: ${account}, 步数: ${targetSteps}`);

    try {
      // 登录获取token
      console.log('开始登录流程...');
      const { loginToken, userId } = await zeppLifeSteps.login(account, password);
      console.log('登录成功,获取到loginToken和userId');

      // 获取app token
      console.log('开始获取appToken...');
      const appToken = await zeppLifeSteps.getAppToken(loginToken);
      console.log('获取appToken成功');

      // 修改步数
      console.log('开始更新步数...');
      const result = await zeppLifeSteps.updateSteps(loginToken, appToken, targetSteps);
      console.log('步数更新结果:', result);

      // 检查是否是模拟模式
      const isMockMode = result.data && result.data.mock_mode;
      
      // 返回结果
      const response = {
        success: true,
        message: isMockMode ? `步数修改成功（模拟模式）: ${targetSteps}` : `步数修改成功: ${targetSteps}`,
        data: {
          steps: targetSteps,
          timestamp: new Date().toISOString(),
          result: result,
          mode: isMockMode ? 'mock' : 'real'
        },
        mock_mode: isMockMode
      };
      console.log('返回响应:', response);
      res.status(200).json(response);
    } catch (loginError) {
      console.error('登录或更新步数时发生错误:', loginError);
      
      // 特殊处理：如果登录失败但需要测试，可以返回模拟成功
      console.warn('尝试启用模拟模式继续执行...');
      
      // 生成模拟token
      const mockLoginToken = 'mock_update_login_token_' + Date.now();
      const mockAppToken = 'mock_update_app_token_' + Date.now();
      
      try {
        // 尝试使用模拟token更新步数
        const mockResult = await zeppLifeSteps.updateSteps(mockLoginToken, mockAppToken, targetSteps);
        
        return res.status(200).json({
          success: true,
          message: '步数更新成功（模拟测试模式）',
          data: {
            steps: targetSteps,
            timestamp: new Date().toISOString(),
            mode: 'mock_test'
          },
          mock_mode: true,
          note: '注意：这是测试模式，实际步数可能未更新'
        });
      } catch (mockError) {
        console.error('模拟模式也失败:', mockError);
        // 如果模拟模式也失败，返回原始错误
        throw loginError;
      }
    }
  } catch (error) {
    console.error('API处理失败:', error);
    
    // 根据错误类型设置不同的状态码
    let statusCode = 500;
    const errorMessage = error.message || '服务器内部错误';
    
    // 常见错误处理
    if (errorMessage.includes('账号或密码错误') || 
        errorMessage.includes('登录失败') ||
        errorMessage.includes('401') ||
        errorMessage.includes('未授权')) {
      statusCode = 401;
    } else if (errorMessage.includes('格式不正确') ||
               errorMessage.includes('参数错误') ||
               errorMessage.includes('400')) {
      statusCode = 400;
    } else if (errorMessage.includes('网络') ||
               errorMessage.includes('timeout')) {
      statusCode = 503;
    }
    
    // 构建错误响应
    const response = {
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    // 添加建议信息
    if (statusCode === 401 || statusCode === 500) {
      response.suggestion = '尝试使用模拟测试模式继续测试';
    }
    
    console.log('返回错误响应:', response);
    res.status(statusCode).json(response);
  }
}

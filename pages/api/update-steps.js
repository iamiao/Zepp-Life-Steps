// 使用 require 而不是 import，避免 ES 模块问题
const zeppLifeSteps = require('./ZeppLifeSteps');

// 使用 module.exports 而不是 export default
module.exports = async function handler(req, res) {
  // 设置响应头，允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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
      // 生成随机步数（范围适当调整，更接近真实）
      targetSteps = Math.floor(Math.random() * 8000) + 12000;
    }
    
    console.log('目标步数:', targetSteps);

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

    // 返回结果
    const response = {
      success: true,
      message: `步数修改成功: ${targetSteps}`,
      data: {
        steps: targetSteps,
        timestamp: new Date().toISOString(),
        result: result
      }
    };
    console.log('返回响应:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('API处理失败:', error);
    
    // 根据错误类型设置不同的状态码
    let statusCode = 500;
    const errorMessage = error.message || '服务器内部错误';
    
    // 常见错误处理
    if (errorMessage.includes('账号或密码错误') || 
        errorMessage.includes('登录失败') ||
        errorMessage.includes('401')) {
      statusCode = 401;
    } else if (errorMessage.includes('格式不正确')) {
      statusCode = 400;
    }
    
    const response = {
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    console.log('返回错误响应:', response);
    res.status(statusCode).json(response);
  }
}

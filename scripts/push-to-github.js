const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 推送代码到GitHub仓库的脚本
 */

// 配置
const config = {
    branch: '06200217uploadfinalversion',
    commitMessage: 'fix: 修复健康检查配置，确保Railway部署成功',
    remote: 'origin'
};

// 执行Git命令
function runGitCommand(command) {
    console.log(`执行: ${command}`);
    try {
        const output = execSync(command, { encoding: 'utf8' });
        console.log(output);
        return output;
    } catch (error) {
        console.error(`命令执行失败: ${error.message}`);
        if (error.stdout) console.log(error.stdout);
        if (error.stderr) console.error(error.stderr);
        throw error;
    }
}

// 主函数
async function main() {
    try {
        console.log('🚀 开始推送代码到GitHub...');
        
        // 检查Git状态
        const status = runGitCommand('git status --porcelain');
        if (status) {
            console.log('📝 有未提交的更改，准备提交...');
            
            // 添加所有更改
            runGitCommand('git add .');
            
            // 提交更改
            runGitCommand(`git commit -m "${config.commitMessage}"`);
            console.log('✅ 更改已提交');
        } else {
            console.log('✅ 工作区干净，无需提交');
        }
        
        // 检查分支是否存在
        try {
            runGitCommand(`git show-ref --verify --quiet refs/heads/${config.branch}`);
            console.log(`✅ 分支 ${config.branch} 已存在`);
        } catch (error) {
            console.log(`🔄 创建新分支 ${config.branch}`);
            runGitCommand(`git checkout -b ${config.branch}`);
        }
        
        // 确保在正确的分支上
        runGitCommand(`git checkout ${config.branch}`);
        
        // 推送到远程仓库
        console.log(`🔄 推送到远程仓库 ${config.remote}/${config.branch}...`);
        runGitCommand(`git push -u ${config.remote} ${config.branch}`);
        
        console.log('✅ 代码已成功推送到GitHub!');
        console.log(`🔗 分支: ${config.branch}`);
        console.log(`📝 提交信息: ${config.commitMessage}`);
        
    } catch (error) {
        console.error('❌ 推送失败:', error.message);
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error); 
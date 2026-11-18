import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { BusinessLoginProps } from "@crazytalk/shared/react";
import "./BusinessLogin.css";

export default function BusinessLogin({
  login, password, onLoginChange, onPasswordChange, onSubmit, error, busy,
}: BusinessLoginProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <main className="business-login">
      <header className="business-login__brand">
        <img src="/brand/login-logo.png" width="188" height="188" alt="Crazy Talk" />
      </header>
      <section className="business-login__intro" aria-labelledby="business-login-intro">
        <div>
          <h2 id="business-login-intro">让教学管理更有条理</h2>
          <p>连接教务、老师与每一位学员</p>
          <img src="/brand/login-illustration.png" width="620" height="387" alt="" />
        </div>
      </section>
      <section className="business-login__panel" aria-labelledby="business-login-title">
        <div className="business-login__content">
          <h1 id="business-login-title">欢迎登录</h1>
          <p className="business-login__subtitle">Crazy Talk 教务管理后台</p>
          <form onSubmit={onSubmit} aria-describedby="business-login-hint">
            <div className="field">
              <label htmlFor="business-login-account">账号</label>
              <input id="business-login-account" name="username" autoComplete="username" placeholder="请输入账号"
                value={login} onChange={event => onLoginChange(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="business-login-password">密码</label>
              <div className="business-login__password">
                <input id="business-login-password" name="password" type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password" placeholder="请输入密码"
                  value={password} onChange={event => onPasswordChange(event.target.value)} required />
                <button type="button" aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                  onClick={() => setPasswordVisible(visible => !visible)}>
                  {passwordVisible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </div>
            {error && error !== "请登录" && <p className="business-login__error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary business-login__submit" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </button>
          </form>
          <p id="business-login-hint">请使用管理员分配的账号登录</p>
        </div>
      </section>
    </main>
  );
}

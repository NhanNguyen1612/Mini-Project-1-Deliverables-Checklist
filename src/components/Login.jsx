import React, { useState } from 'react';
import { supabase, updateSupabaseConfig, saveUserRole, getUserRoleByEmail, registerLocalUser } from '../supabaseClient';
import { LogIn, UserPlus, Settings, Check } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [showConfig, setShowConfig] = useState(false);
  const [customUrl, setCustomUrl] = useState(localStorage.getItem('vku_supabase_url') || '');
  const [customKey, setCustomKey] = useState(localStorage.getItem('vku_supabase_key') || '');
  const [configSaved, setConfigSaved] = useState(false);

  const handleSaveConfig = (e) => {
    e.preventDefault();
    if (customUrl && customKey) {
      updateSupabaseConfig(customUrl, customKey);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    let userObj = null;
    let userRole = role;

    try {
      if (isSignUp) {
        registerLocalUser(email, role, password);
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user) {
          userObj = data.user;
          sessionStorage.setItem('vku_current_demo_user', JSON.stringify(userObj));
          localStorage.setItem('vku_current_demo_user', JSON.stringify(userObj));
          await supabase.from('profiles').insert([{ id: userObj.id, email, role }]);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) {
          userObj = data.user;
          sessionStorage.setItem('vku_current_demo_user', JSON.stringify(userObj));
          localStorage.setItem('vku_current_demo_user', JSON.stringify(userObj));
          userRole = getUserRoleByEmail(email);
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userObj.id)
            .single();
          if (profile?.role) userRole = profile.role;
        }
      }

      if (userObj) {
        sessionStorage.setItem('vku_active_session_role', userRole);
        localStorage.setItem('vku_current_user_role_' + userObj.email, userRole);
        onLoginSuccess(userObj, userRole);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình xác thực. Vui lòng kiểm tra lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">VKU Field Survey PWA</h1>
          <p className="text-sm text-slate-500 mt-1">Đăng nhập hệ thống khảo sát cơ sở vật chất</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email VKU</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              placeholder="student@vku.udn.vn"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vai trò (Role đăng ký)</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white font-medium"
              >
                <option value="student">👨‍🎓 Học sinh / Sinh viên (Student)</option>
                <option value="teacher">👨‍🏫 Giảng viên / Quản lý (Teacher)</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2"
          >
            {isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />}
            {loading ? 'Đang xử lý...' : isSignUp ? 'Đăng ký Tài khoản' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-blue-700 font-medium hover:underline block w-full"
          >
            {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay'}
          </button>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1 mx-auto"
          >
            <Settings size={14} /> {showConfig ? 'Ẩn cấu hình Supabase' : 'Cấu hình Supabase Project URL & Key'}
          </button>
        </div>

        {showConfig && (
          <form onSubmit={handleSaveConfig} className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase">Cấu hình Supabase Credentials</h4>
            <div>
              <input
                type="text"
                placeholder="https://xyz.supabase.co"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-800 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1"
            >
              {configSaved ? <Check size={14} className="text-emerald-400" /> : null}
              {configSaved ? 'Đã lưu cấu hình!' : 'Lưu Cấu hình Supabase'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

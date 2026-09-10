import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LayoutDashboard, PlusCircle, Trash2, Search, Filter, RefreshCw, MapPin, Image as ImageIcon, Send, CheckCircle2 } from 'lucide-react';

export default function TeacherDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('reports');
  const [inspections, setInspections] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [requestTitle, setRequestTitle] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('Máy tính / Monitor, Bàn ghế, Điều hòa, Hệ thống chiếu sáng');
  const [requestSuccessMsg, setRequestSuccessMsg] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    fetchData();

    const handleSyncEvent = () => {
      fetchData();
    };

    window.addEventListener('storage', handleSyncEvent);

    const intervalId = setInterval(handleSyncEvent, 2000);

    const channel = typeof window !== 'undefined' && window.BroadcastChannel ? new BroadcastChannel('vku_survey_sync_channel') : null;
    if (channel) {
      channel.onmessage = (event) => {
        handleSyncEvent();
      };
    }

    return () => {
      window.removeEventListener('storage', handleSyncEvent);
      clearInterval(intervalId);
      if (channel) channel.close();
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchAllInspections(), fetchAllRequests()]);
    setLoading(false);
  };

  const fetchAllInspections = async () => {
    try {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setInspections(data);
    } catch (e) {
      console.warn(e);
    }
  };

  const fetchAllRequests = async () => {
    try {
      const { data } = await supabase
        .from('survey_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setRequests(data);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    const catArray = categoriesInput.split(',').map(c => c.trim()).filter(Boolean);
    const payload = {
      teacher_email: user?.email || 'teacher@vku.udn.vn',
      title: requestTitle,
      facility_name: facilityName,
      categories: catArray,
      created_at: new Date().toISOString()
    };

    await supabase.from('survey_requests').insert([payload]);
    setRequestSuccessMsg('Đã tạo và gửi Yêu cầu Khảo sát tới toàn bộ Sinh viên thành công!');
    setRequestTitle('');
    setFacilityName('');
    fetchAllRequests();
    setTimeout(() => setRequestSuccessMsg(''), 4000);
  };

  const handleDeleteInspection = async (id) => {
    if (confirm('Bạn có chắc muốn xóa bản ghi đánh giá này?')) {
      await supabase.from('inspections').delete().eq('id', id);
      fetchAllInspections();
    }
  };

  const handleDeleteRequest = async (id) => {
    if (confirm('Bạn có chắc muốn xóa yêu cầu khảo sát này?')) {
      await supabase.from('survey_requests').delete().eq('id', id);
      fetchAllRequests();
    }
  };

  const filteredInspections = inspections.filter((item) => {
    const facilityMatch = item.facility_name ? item.facility_name.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const userMatch = item.user_email ? item.user_email.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const matchesSearch = facilityMatch || userMatch;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const total = inspections.length;
  const goodCount = inspections.filter((i) => i.status === 'good').length;
  const mainCount = inspections.filter((i) => i.status === 'maintenance').length;
  const dangerCount = inspections.filter((i) => i.status === 'danger').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard size={22} className="text-blue-900" />
            Dashboard Giảng viên - VKU Field Survey
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">Quản lý Yêu cầu khảo sát & Đánh giá của Sinh viên</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'reports' ? 'bg-blue-900 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <LayoutDashboard size={16} /> Kết quả Báo cáo
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'create' ? 'bg-blue-900 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <PlusCircle size={16} /> Tạo Yêu cầu mới
          </button>
          <button
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Đồng bộ dữ liệu"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {activeTab === 'create' ? (
        <div className="space-y-6">
          {requestSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <span className="text-sm font-medium">{requestSuccessMsg}</span>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <PlusCircle size={20} className="text-blue-900" /> Tạo Yêu cầu Khảo sát Cơ sở Vật chất mới
            </h3>
            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên Tiêu đề Yêu cầu</label>
                <input
                  type="text"
                  required
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  placeholder="Ví dụ: Khảo sát Tình trạng Trang thiết bị HK1"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên Vị trí / Cơ sở Vật chất</label>
                <input
                  type="text"
                  required
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="Ví dụ: Khu B - Phòng máy B102"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hạng mục kiểm tra (phân cách bằng dấu phẩy)</label>
                <textarea
                  rows={2}
                  required
                  value={categoriesInput}
                  onChange={(e) => setCategoriesInput(e.target.value)}
                  placeholder="Máy tính / Monitor, Bàn ghế, Điều hòa, Hệ thống chiếu sáng"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl shadow transition flex items-center justify-center gap-2"
              >
                <Send size={18} /> Gửi Yêu cầu cho Sinh viên
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-md font-bold text-slate-800 mb-4">Các Yêu cầu Khảo sát Đã Phát hành</h3>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Chưa có yêu cầu khảo sát nào được gửi.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div key={req.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900">{req.title}</h4>
                      <p className="text-xs text-blue-900 font-medium mt-0.5">Vị trí: {req.facility_name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Array.isArray(req.categories) && req.categories.map((cat, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-md font-medium">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRequest(req.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Xóa yêu cầu"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-xs text-slate-500 font-semibold uppercase">Tổng số phiếu</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">{total}</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm text-center">
              <span className="text-xs text-emerald-700 font-semibold uppercase">Tốt 🟢</span>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{goodCount}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm text-center">
              <span className="text-xs text-amber-700 font-semibold uppercase">Bảo trì 🟡</span>
              <p className="text-2xl font-bold text-amber-800 mt-1">{mainCount}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm text-center">
              <span className="text-xs text-red-700 font-semibold uppercase">Hỏng hóc 🔴</span>
              <p className="text-2xl font-bold text-red-800 mt-1">{dangerCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm theo vị trí hoặc email học sinh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
              >
                <option value="all">Tất cả tình trạng</option>
                <option value="good">Hoạt động tốt</option>
                <option value="maintenance">Cần bảo trì</option>
                <option value="danger">Hỏng hóc / Nguy hiểm</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Đang tải dữ liệu khảo sát từ Cloud...</div>
            ) : filteredInspections.length === 0 ? (
              <div className="p-8 text-center text-slate-500">Chưa có khảo sát nào từ sinh viên.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="p-4">Cơ sở vật chất</th>
                      <th className="p-4">Sinh viên báo cáo</th>
                      <th className="p-4">Đánh giá Chi tiết Hạng mục</th>
                      <th className="p-4">Ảnh minh chứng</th>
                      <th className="p-4">Định vị GPS</th>
                      <th className="p-4 text-center">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredInspections.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4">
                          <span className="font-bold text-slate-900 block">{item.facility_name}</span>
                          <span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString('vi-VN')}</span>
                        </td>
                        <td className="p-4 text-slate-600 text-xs">{item.user_email}</td>
                        <td className="p-4 max-w-sm">
                          <div className="space-y-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-block ${
                              item.status === 'good' ? 'bg-emerald-100 text-emerald-800' :
                              item.status === 'maintenance' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                            }`}>
                              Tổng thể: {item.status === 'good' ? 'Tốt 🟢' : item.status === 'maintenance' ? 'Bảo trì 🟡' : 'Hỏng 🔴'}
                            </span>

                            {item.category_ratings && typeof item.category_ratings === 'object' && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(item.category_ratings).map(([cat, rating]) => (
                                  <span key={cat} className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                    rating === 'good' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    rating === 'maintenance' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200'
                                  }`}>
                                    {cat}: {rating === 'good' ? '🟢 Tốt' : rating === 'maintenance' ? '🟡 Bảo trì' : '🔴 Hỏng'}
                                  </span>
                                ))}
                              </div>
                            )}

                            {item.description && (
                              <p className="text-slate-600 text-xs mt-1 border-t border-slate-100 pt-1">{item.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {item.image_url ? (
                            <button
                              onClick={() => setPreviewImage(item.image_url)}
                              className="flex items-center gap-1 text-xs text-blue-700 font-semibold hover:underline"
                            >
                              <ImageIcon size={14} /> Xem minh chứng
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Không có ảnh</span>
                          )}
                        </td>
                        <td className="p-4">
                          {item.latitude && item.longitude ? (
                            <a
                              href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition"
                            >
                              <MapPin size={14} /> {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Chưa định vị</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteInspection(item.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Xóa bản ghi"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <div className="bg-white p-4 rounded-2xl max-w-lg w-full relative" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-slate-800 mb-2">Ảnh Minh chứng Khảo sát</h4>
            <img src={previewImage} alt="Evidence" className="w-full max-h-96 object-contain rounded-xl border" />
            <button
              onClick={() => setPreviewImage(null)}
              className="mt-4 w-full bg-slate-800 text-white font-medium py-2 rounded-xl text-sm"
            >
              Đóng Xem Ảnh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

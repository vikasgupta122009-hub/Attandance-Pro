import React from 'react';
import { Shield, Trash2, Smartphone, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface DeviceSettingsProps {
  onClose: () => void;
}

export function DeviceSettings({ onClose }: DeviceSettingsProps) {
  const isAndroid = !!window.AndroidBridge;

  const handleClearCache = () => {
    if (window.AndroidBridge) {
      window.AndroidBridge.clearCache();
      window.AndroidBridge.showToast('System Cache Cleared Successfully');
    } else {
      alert('Manual clearing: Log out to clear session data.');
    }
  };

  const handleTestToast = () => {
    if (window.AndroidBridge) {
      window.AndroidBridge.showToast('Test Connection: Android Bridge Active');
    } else {
      alert('Running in Browser Mode: Bridge inactive.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
        <Smartphone className="text-indigo-600" size={24} />
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Device Integration</p>
          <p className="text-xs font-bold text-indigo-900">
            {isAndroid ? 'Android Native Support Enabled' : 'Browser Mode (Web View)'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleClearCache}
          className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center">
              <Trash2 size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-800 uppercase">Clear Local Cache</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Wipe Auth & Storage</p>
            </div>
          </div>
          <CheckCircle size={18} className="text-slate-200 group-hover:text-rose-500 transition-all" />
        </button>

        <button
          onClick={handleTestToast}
          className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center">
              <Shield size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-800 uppercase">Test Connection</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Check Android Bridge</p>
            </div>
          </div>
          <CheckCircle size={18} className="text-slate-200 group-hover:text-emerald-500 transition-all" />
        </button>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
        <p className="text-[9px] font-medium text-amber-700 leading-relaxed italic">
          Tip: Clearing cache will require you to log back in. Use this only if the app feels slow or data sync issues occur.
        </p>
      </div>

      <button
        onClick={onClose}
        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all"
      >
        Close Device Settings
      </button>
    </div>
  );
}

import { useState } from 'react';
import Card from '../components/ui/Card.jsx';

export default function GuidePage() {
  const [tab, setTab] = useState('user'); // 'user' | 'admin'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card title="คู่มือการใช้งานระบบจองห้อง" icon="📖">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('user')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
                tab === 'user'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              👤 สำหรับผู้ใช้ทั่วไป
            </button>
            <button
              type="button"
              onClick={() => setTab('admin')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
                tab === 'admin'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              ⚡ สำหรับผู้ดูแลระบบ (Admin)
            </button>
          </div>
        </div>

        {tab === 'user' ? (
          <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-black">1</span>
                ขั้นตอนการจองห้องเรียน / ห้องประชุม
              </h3>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-slate-600 dark:text-slate-400">
                <li>ไปที่หน้า <strong>"จองห้อง"</strong> จากเมนูด้านบน</li>
                <li>เลือกว่าต้องการจองวันใดจากปฏิทิน</li>
                <li>เลือกช่วงเวลา (เช้า, บ่าย, ค่ำ หรือจองทั้งวัน)</li>
                <li>ระบบจะแสดงรายการห้องที่ <strong>"ว่าง"</strong> (สีเขียว), <strong>"มีการจองทับเวลา"</strong> (สีแดง) หรือ <strong>"ปิดปรับปรุง"</strong> (สีส้ม)</li>
                <li>คลิกเลือกห้องที่ต้องการ เพื่อเปิดแบบฟอร์มระบุวัตถุประสงค์และอุปกรณ์ที่ต้องการใช้</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-black">2</span>
                การจองซ้ำทุกสัปดาห์ (Recurring Booking) ↻
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
                เหมาะสำหรับวิชาที่มีการเรียนการสอนทุกสัปดาห์ในห้องเดิม ในขั้นตอนที่ 1 ของการจอง ให้ติ๊กเลือก <strong>"จองซ้ำทุกสัปดาห์"</strong> และระบุจำนวนสัปดาห์ (2-12 สัปดาห์)
              </p>
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/40 p-3 text-xs text-violet-800 dark:text-violet-300">
                💡 <strong>เคล็ดลับ:</strong> สัปดาห์ใดที่มีผู้อื่นจองห้องไว้แล้ว ระบบจะข้ามสัปดาห์นั้นและจองสัปดาห์ที่เหลือให้โดยอัตโนมัติ พร้อมแจ้งสรุปผลหลังการจอง
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-black">3</span>
                การติดตามสถานะ พิมพ์ใบจอง และการยกเลิก
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-2 text-slate-600 dark:text-slate-400">
                <li>ไปที่หน้า <strong>"การจองของฉัน"</strong> เพื่อดูสถานะคำขอ (รออนุมัติ / ยืนยันแล้ว / ถูกยกเลิก)</li>
                <li>หากการจองได้รับการยืนยันแล้ว สามารถกดปุ่ม <strong>"พิมพ์ใบจอง"</strong> เพื่อใช้เป็นหลักฐาน</li>
                <li>หากต้องการยกเลิกการจอง สามารถกด <strong>"ยกเลิก"</strong> ได้ตลอดเวลา (หากเป็นการจองซ้ำ ระบบจะมีตัวเลือกว่าจะยกเลิกเฉพาะสัปดาห์นี้หรือยกเลิกทั้งชุด)</li>
              </ul>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-black">1</span>
                การอนุมัติสมาชิกใหม่และการจัดการสิทธิ์
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                ผู้สมัครใหม่ทุกคนจะต้องผ่านการอนุมัติจาก Admin ก่อนจึงจะสามารถเข้าใช้งานระบบได้ Admin สามารถอนุมัติหรือกำหนดบทบาท (User / Admin) ได้ที่หน้า <strong>"ผู้ดูแลระบบ"</strong> ในแท็บผู้ใช้งาน
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-black">2</span>
                การอนุมัติ/ปฏิเสธคำขอจองห้อง และการระบุเหตุผล
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
                ทุกครั้งที่ Admin ปฏิเสธหรือยกเลิกการจองของสมาชิก <strong>ระบบบังคับให้ระบุเหตุผล</strong> เพื่อส่งแจ้งเตือนและบันทึกเป็นหลักฐานในระบบ
              </p>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300">
                🔒 <strong>Audit Log:</strong> ทุกการกระทำของ Admin เช่น อนุมัติการจอง, ปฏิเสธคำขอ, ลบห้อง หรือปรับสิทธิ์ จะถูกบันทึกประวัติไว้ใน Audit Log ไม่สามารถแก้ไขหรือลบได้
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-black">3</span>
                การปิดปรับปรุงห้องชั่วคราว (Maintenance Mode)
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                เมื่อห้องเกิดความชำรุดหรือต้องซ่อมแซม Admin สามารถเปลี่ยนสถานะห้องเป็น <strong>"ปิดปรับปรุง (Maintenance)"</strong> ได้ในหน้าจัดการห้อง ระบบจะป้องกันไม่ให้สมาชิกทำการจองห้องนั้นจนกว่าจะเปิดใช้งานอีกครั้ง
              </p>
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}

import { SearchX } from "lucide-react";
import Link from "next/link";
export default function NotFound() { return <div className="grid min-h-[70vh] place-items-center p-6 text-center"><div><SearchX className="mx-auto mb-3 text-muted" /><h1 className="text-lg font-semibold">未找到股票</h1><p className="mt-2 text-sm text-muted">本地工作区中没有这个股票代码。</p><Link href="/stocks" className="control mt-5">浏览股票</Link></div></div>; }

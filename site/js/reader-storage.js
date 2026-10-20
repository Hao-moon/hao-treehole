const DATABASE = 'hao-hideout-reader';
let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
      request.result.createObjectStore('state', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => reject(new Error('请关闭另一个阅读窗口后重试。'));
  });
  return connection;
}
async function operation(name, mode, work) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = work(transaction.objectStore(name));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error || new Error('书籍没有保存成功。'));
    transaction.onabort = () => reject(transaction.error || new Error('书籍保存已中断。'));
  });
}
export const listReaderBooks = () => operation('books', 'readonly', store => store.getAll());
export const saveReaderBook = book => operation('books', 'readwrite', store => store.put(book));
export const readReaderState = id => operation('state', 'readonly', store => store.get(id));
export const saveReaderState = state => operation('state', 'readwrite', store => store.put(state));

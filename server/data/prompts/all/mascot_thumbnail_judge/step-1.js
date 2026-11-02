export default (language, title, candidates) => `Bạn là giám khảo thumbnail YouTube khó tính. Tôi đính kèm các ảnh theo đúng thứ tự:
- Ảnh 1: ảnh tham chiếu của mascot (nhân vật chuẩn của kênh).
- Ảnh 2 trở đi: các thumbnail ứng viên, lần lượt là ứng viên 1, 2, 3...

Title video: ${title}
Ngôn ngữ chữ trên thumbnail: ${language}

Chữ dự kiến của từng ứng viên (JSON):
${candidates}

====================================================
CHẤM TỪNG ỨNG VIÊN
====================================================
1. text_correct (true/false): đọc từng ký tự trên ảnh và so với hook_lines. False nếu có ký tự sai, thiếu, thừa, méo không đọc được, chữ giả (nét vô nghĩa), hoặc có chữ ngoài dự kiến. Với tiếng Nhật/Hàn hãy soi kỹ từng kana/kanji/hangul. Nếu false, ghi rõ chỗ sai vào text_issues.
2. mascot_match (0-10): mascot trên thumbnail có giống ảnh 1 không (hình dáng, khuôn mặt, màu, trang phục, nét vẽ). 10 = giống hệt, dưới 5 = thành nhân vật khác.
3. readability (0-10): hình dung ảnh thu nhỏ còn 320x180 trên điện thoại: chữ còn đọc được không, độ tương phản, bố cục có rối không, góc dưới bên phải có trống không.
4. curiosity (0-10): thumbnail có khiến người xem muốn bấm không (cảm xúc mascot, từ khoá nhấn mạnh, ẩn dụ thị giác).
5. title_fit (0-10): thumbnail và title có bổ trợ nhau, không lặp nguyên văn, cùng một lời hứa không.
6. reason: 1 câu tiếng Việt nêu điểm mạnh/yếu chính.

Chấm độc lập, công bằng, không nể nang; đừng cho mọi ứng viên cùng điểm.

====================================================
OUTPUT
====================================================
Chỉ trả về đúng một khối JSON (trong code block json), không giải thích thêm:
{
  "results": [
    {
      "candidate": 1,
      "text_correct": true,
      "text_issues": "",
      "mascot_match": 8,
      "readability": 7,
      "curiosity": 9,
      "title_fit": 8,
      "reason": "..."
    }
  ]
}
Mảng "results" phải có đúng một phần tử cho mỗi ứng viên.`;

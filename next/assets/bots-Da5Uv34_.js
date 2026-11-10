var e=`# Bot

**Bot** là một người chơi do game chơi thay bạn. Trong sảnh bạn làm chủ,
bot chơi mọi chỗ không ai nhận, để bạn có thể luyện tập, hoặc chơi với ít
bạn bè hơn.

## Ai chơi bằng bot

Không ai thêm bot: sảnh chỉ liệt kê người thật. Khi
[Sảnh Đội](modes.md#sảnh-đội) kết thúc, mỗi bên chơi Build đội đã chọn, và
mọi nhân vật của build đó không ai nhận sẽ do bot chơi, dưới tên của nhân
vật đó. Một bên không có ai sẽ chơi một đội có sẵn ngẫu nhiên, toàn bot. Ai
rời đi trong lúc Sảnh Đội diễn ra sẽ để lại nhân vật của mình cho bot.

Trong sảnh và Sảnh Đội, bot trông như bất kỳ ai khác. Trong trận, nó được gắn
nhãn **BOT** trên bảng tên, khung mục tiêu, cửa sổ tổ đội và bảng tổng kết
trận.

Bot được tạo cho một trận: khi trận kết thúc, sảnh lại liệt kê người thật,
và bot của trận kế tiếp được tạo mới.

## Bot chiến đấu thế nào

Bot đảm nhận vai trò mà build của nó giao. Bot cầm vũ khí cận chiến là
**tiền tuyến**: nó áp sát và tấn công mục tiêu. Bot có từ hai kỹ năng hồi
máu hoặc bảo vệ trở lên có thể dùng lên đồng minh là **hồi máu**: nó đứng
phía sau đồng minh nào đang bị thương nặng nhất, tránh xa địch. Khi hai địch
trở lên tập trung vào một đồng minh, bot hồi máu đặt kỹ năng bảo vệ lên đồng
minh đó trước khi đòn đánh tới. Mọi bot khác là **tầm xa**: nó giữ vị trí mà
mọi đòn tấn công của nó đều với tới, và đứng lại đánh địch nào tiến quá gần.
Bot tầm xa và bot hồi máu bước tới chỗ ít địch với tới được hơn, và dùng cột
làm chỗ nấp. Cả đội quay sang bất kỳ địch nào trong tầm có máu dưới 60%, để
kết liễu. Trong Vua đồi, khi đội bạn không giữ tế đàn, Anh hùng Ma của đội
kia trên tế đàn còn được ưu tiên hơn cả điều đó. Bot đi quá xa đội của nó sẽ
chờ những người còn lại rồi mới tiến tiếp.

Bot gây sát thương giữ lại các đòn lớn, kỹ năng Tấn công và Phép sát thương,
rồi tung chúng cùng lúc vào mục tiêu của đội, để sát thương dồn về một lúc
thay vì rỉ rả cho bot hồi máu xóa đi: Phép chậm nhất đi trước, Phép nhanh
hơn đi sau đúng bằng khoảng nó nhanh hơn. Trong lúc đó chúng vẫn tiếp tục
vung vũ khí và thi triển Nguyền và Dị trạng. Bot chờ đồng đội tối đa bốn
giây, và không chờ chút nào để kết liễu địch dưới 30% máu. Khi mục tiêu đang
được một Phù phép bảo vệ như Protective Spirit hay Aegis, bot có kỹ năng gỡ
Phù phép, như Strip Enchantment, sẽ gỡ nó trước, và các bot khác giữ đòn chờ
nó.

Bot bị thương nặng đang thua thế sẽ lùi về sau bot hồi máu của nó, hoặc về
căn cứ, và nghỉ ngoài tầm với cho đến khi hồi lại phần lớn máu.

Bot chỉ hồi sinh đồng minh đã ngã khi địch không ở sát xác, số đồng đội đứng
gần đó nhiều hơn số địch, và không bao giờ khi có địch ở gần đang nhắm vào
chính bot đó.

Bot né khoảng một nửa số đòn kỹ năng phóng ra nhắm vào chúng, như Fireball
hoặc mũi tên của kỹ năng Tấn công, nên dừng lại hay đổi hướng có tác dụng với
chúng như với bạn.

Bot đi vòng qua mặt đất đang cháy và các vùng có hại khác khi đường vòng
không dài hơn nhiều, và bước ra khỏi vùng mà chúng đang đứng.

Bot có kỹ năng ngắt sẽ dành nó cho những lần thi triển quan trọng: trước hết
là hồi sinh hoặc Anh hùng Ma đang chiếm tế đàn, sau đó là hồi máu hoặc bảo
vệ, kỹ năng Tinh anh, hoặc một đòn lớn như kỹ năng Tấn công hay Phép sát
thương. Nó để mọi thứ khác, và đòn vũ khí thường, đi qua. Giống người chơi,
nó bỏ lỡ khoảng một trên bốn lần thi triển như vậy.

Bot cần một khoảnh khắc giống con người, một phần của giây, để phản ứng với
những gì xảy ra, nên một cú ngắt nhanh hay một cú né muộn có thể qua mặt nó.

Trong trận ba đội, bot đánh từng đội địch một: đội đang tấn công chúng,
hoặc, khi không có ai, đội bị thương nặng nhất trong tầm. Chúng bám đội đó cho
đến khi một đội khác dồn rõ ràng nhiều người chơi hơn vào chúng, và không lao
vào một đội mới khi đội khác đang tấn công chúng. Mục tiêu do đội chúng gọi
được ưu tiên, dù nó thuộc đội nào. Chỉ người chơi mới được tính: ma hay lính
gác của một đội đứng gần đó không khiến bot quay sang đội đó.

## Đấu trường ngẫu nhiên

Đấu trường ngẫu nhiên không có bot: mọi chỗ đều là người chơi thật, và bạn
chờ cho đến khi đủ người xếp hàng.
`;export{e as default};
//# sourceMappingURL=bots-Da5Uv34_.js.map
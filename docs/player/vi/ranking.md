# Xếp hạng

## Thế nào là trận xếp hạng

Mọi trận từ hàng chờ không có bot đều là trận xếp hạng: Đấu trường ngẫu
nhiên và Đấu trường đội. Trận tự tạo, sân tập và mọi trận có bot đều
không xếp hạng. Không có công tắc nào cho việc này và không có hàng chờ
riêng. Trận xếp hạng không bao giờ lấp chỗ trống bằng bot.

## Điểm của bạn

Điểm của bạn gắn với khóa người chơi của bạn, khóa mà trình duyệt này
giữ. Mọi nhân vật bạn chơi trên đó dùng chung một điểm.

Hàng chờ xếp hạng ghép những người chơi có điểm gần nhau và chia họ
thành các đội có điểm trung bình gần nhau. Việc tìm kiếm bắt đầu trong
phạm vi 100 điểm quanh điểm của bạn và nới rộng 10 điểm cho mỗi giây bạn
chờ, tối đa 600, nên không ai phải chờ mãi. Trong lúc chờ, hàng chờ hiển
thị điểm của bạn.

10 trận tính điểm đầu tiên của bạn là tạm thời: hàng chờ ghi
**Tạm thời (3/10 trận)** và bạn chưa có hạng. Sau đó menu chính hiển thị
hạng của bạn. Điểm sẽ phai dần: mỗi ngày không có trận tính điểm khiến
điểm của bạn kém chắc chắn hơn, và bảng xếp hạng sắp theo một giá trị
thận trọng, nên nếu bạn ngừng chơi, hạng của bạn sẽ tụt trong vài tuần.

Khi bảng xếp hạng có 20 người chơi đã ổn định, một trận xếp hạng chỉ
được tính khi trong trận có ít nhất 1 người chơi đã ổn định (10 trận tính
điểm trở lên): trận chỉ giữa những người chơi mới thì không tính điểm.
Hãy chơi với người đã ổn định và các trận của bạn sẽ được tính.

Nút **Bảng xếp hạng** trên thanh trên cùng liệt kê 100 người đứng đầu
theo hạng, tên và điểm, với hàng của bạn được làm nổi bật.

Cấp anh hùng (★) không phải là điểm này: nó đến từ danh tiếng, xem
[Đỉnh Anh Hùng](modes.md#đỉnh-anh-hùng).

## Bắt đầu trận

Khi tìm được trận xếp hạng, mọi người xác nhận trong 15 giây, và màn hình
hiện **Đang xác nhận trận xếp hạng…** Nếu ai đó không xác nhận, trận bị
hủy và mọi người trở lại hàng chờ.

## Kết thúc trận

Khi kết thúc, mọi người ký vào kết quả trong 30 giây. Không ký được tính
là rời trận, và rời trận xếp hạng tính là thua, chủ phòng cũng vậy. Nút
rời trận cho biết điều đó. Kết quả chỉ được tính khi hơn một nửa số chỗ
đã ký.

## Những gì được công bố

Biên nhận của trận được gửi lên các relay Nostr công khai. Trong đó có
khóa công khai và tên nhân vật của từng người chơi (người chơi không có
nhân vật được ghi là starter), và ai đã chơi với ai. Ai cũng đọc được và
không thể thu hồi. Trận không xếp hạng không công bố gì.

## Khi nào cập nhật

Điểm của bạn thay đổi trong vòng một giờ, và bảng xếp hạng cũng vậy.
